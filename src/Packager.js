/**
 * Copyright 2013 Facebook, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
"use strict";

/**
 * Using Node-Haste.
 */
var BrowserShimLoader = require('./BrowserShimLoader');
var CSSLoader = require('node-haste/lib/loader/CSSLoader');
var Haste = require('node-haste/lib/Haste');
var HasteDependencyLoader = require('node-haste/lib/HasteDependencyLoader');
var ImageLoader = require('node-haste/lib/loader/ImageLoader');
var JSLoader = require('node-haste/lib/loader/JSLoader');
var Modularizer = require('./Modularizer');
var Package = require('./Package');
var ProjectConfigurationLoader = require('node-haste/lib/loader/ProjectConfigurationLoader');
var ResourceLoader = require('node-haste/lib/loader/ResourceLoader');
var ResourceMap = require('node-haste/lib/ResourceMap');
var SymbolicLinkFinder = require('./SymbolicLinkFinder');

var async = require('async');
var fs = require('fs');
var hasteLoaders = require('node-haste/lib/loaders');
var path = require('path');
var transform = require('react-tools/vendor/fbtransform/lib/transform').transform;
var visitors = require('react-tools/vendor/fbtransform/visitors').transformVisitors;

var originalSourceCache = {};
var transformCache = {};
var transformTimes = {};

var resourceMap = new ResourceMap();

var getResourceMapInstance = function() {
  return resourceMap;
};
var hasteInstance;

var prepareForRE = function(str) {
  return str.replace(/\./g, function() {
    return '\\.';  // escape the dots.
  });
};

/**
 * These directories show up in various places - they are never good to bundle
 * in a browser package.
 */
var BLACKLIST_EXTS = [
  '.DS_Store',
  '.git',
  '.module-cache'
].map(function(ext) {
  return prepareForRE(ext + '$');
});

/**
 * These are known to simply be tools of `react-page`, not the app that you wish
 * to package.
 */
var REACT_PAGE_DEPENDENCIES = [
  'contextify',
  'optimist',
  'connect',
  'markdown',
  'react-tools/vendor',
  'react-tools/node_modules'
];

// Everything from the react-page-middleware tree except browser-builtins.
var BLACKLIST_MIDDLEWARE_DEPENDENCIES = [
  'src',
  'polyfill',
  path.join('node_modules', 'node-terminal'),
  path.join('node_modules', 'browserify'),
  path.join('node_modules', 'react-tools'),
  path.join('node_modules', 'node-haste'),
  path.join('node_modules', 'convert-source-map'),
  path.join('node_modules', 'async'),
  path.join('node_modules', 'source-map'),
  path.join('node_modules', 'contextify'),
  path.join('node_modules', 'optimist')
];

var BLACKLIST_FILE_EXTS_RE =
  new RegExp('(' + BLACKLIST_EXTS.join('|') + ')');

var pathRegex = function(paths) {
  return new RegExp('^(' + paths.join('|') + ')');
};

var ensureBlacklistsComputed = function(buildConfig) {
  if (buildConfig._reactPageBlacklistRE && buildConfig._middlewareBlacklistRE) {
    return;
  }
  var reactPageDevDependencyPaths = REACT_PAGE_DEPENDENCIES.map(function(name) {
    return path.resolve(buildConfig.projectRoot, 'node_modules', name);
  }).map(prepareForRE);

  buildConfig._reactPageBlacklistRE = pathRegex(reactPageDevDependencyPaths);
  // Add browser-builtins to blacklist if we don't need them.
  var middlewareBlacklist = !buildConfig.useBrowserBuiltins ?
    BLACKLIST_MIDDLEWARE_DEPENDENCIES.concat('node_modules/browser-builtins/') :
    BLACKLIST_MIDDLEWARE_DEPENDENCIES;
  var middlewareBlacklistPaths = middlewareBlacklist.map(function(relPath) {
    return prepareForRE(
      path.resolve(
        buildConfig.projectRoot,
        'node_modules',
        'react-page-middleware',
        relPath
      )
    );
  });
  buildConfig._middlewareBlacklistRE = pathRegex(middlewareBlacklistPaths);
};

/**
 * The `react-page` `projectRoot` is the search root. By default, everything
 * under it is inherently whitelisted. The user may black list certain
 * directories under it. They should be careful not to blacklist the
 * `browser-builtins` in `react-page-middleware`.
 *
 * We ignore any directory that is, or is *inside* of a black listed path.
 *
 * @param {object} buildConfig React-page build config.
 * @param {string} path Absolute path in question.
 * @return {boolean} Whether or not path should be ignored.
 */
var shouldStopTraversing = function(buildConfig, path) {
  ensureBlacklistsComputed(buildConfig);
  var buildConfigBlacklistRE = buildConfig.blacklistRE;
  var internalDependenciesBlacklistRE = buildConfig._reactPageBlacklistRE;
  if (BLACKLIST_FILE_EXTS_RE.test(path) ||
      buildConfig._middlewareBlacklistRE.test(path) ||
      internalDependenciesBlacklistRE.test(path) ||
      buildConfigBlacklistRE && buildConfigBlacklistRE.test(path) ||
      buildConfig.ignorePaths && buildConfig.ignorePaths(path)) {
    return true;
  }
  return false;
};


/**
 * Set of loaders that we accept will load resources that JS modules are capable
 * of depending on.
 */
var validJSModuleDependencyLoaders = [
  JSLoader,
  CSSLoader,
  ImageLoader
];

var validJSDependencyTypeStrings =
  ResourceLoader.getTypesOfLoaderClasses(validJSModuleDependencyLoaders);

var allProjectLoaders =
  validJSModuleDependencyLoaders.concat([ProjectConfigurationLoader]);

/**
 * We must make sure to add react-page-middleware to the ignored search paths,
 * otherwise a prebuilt version of React (which still has @providesModule React)
 * could end up getting bundled with the pure version. Not only would it be
 * wasteful, but the built version requires in the form of (./Module) which
 * would fail.  We'll also filter build/modules/ which is a common place for
 * React build output.
 *
 * We pass the `projectRoot` to haste as the search directory, but we have to do
 * some really heavy filtering along the way.
 */
var getHasteInstance = function(buildConfig) {
  if (hasteInstance) {
    return hasteInstance;
  }
  var browserShimLoader = new BrowserShimLoader(buildConfig);
  var loaders =
    (buildConfig.useBrowserBuiltins ? [browserShimLoader] : []).concat([
      new hasteLoaders.JSLoader({       // JS files
        extractSpecialRequires: true,   // support for requireLazy etc.
        validJSModuleDependencyLoaders: validJSModuleDependencyLoaders
      }),
      new hasteLoaders.ImageLoader({}), // Images too.
      new hasteLoaders.CSSLoader({}),   // CSS files
      new ProjectConfigurationLoader()  // package.json files
    ]);

  var finder = new SymbolicLinkFinder({
    scanDirs: [buildConfig.projectRoot],
    extensions: ResourceLoader.getExtensionsOfLoaderClasses(allProjectLoaders),
    ignore: shouldStopTraversing.bind(null, buildConfig)
  });
  return new Haste(loaders, [buildConfig.projectRoot], {finder: finder});
};

/**
 * Replaces relative modules, transforms JSX, and wraps each module in a
 * `define()`.
 */
var transformModuleImpl = function(mod, modName, rawCode) {
  // TODO: Use browserify Streams API here to transform various sources!
  var resolveModule = function(requiredName) {
    return mod.getModuleIDByOrigin('JS', requiredName);
  };
  var transformResult = transform(visitors.react, rawCode);
  var transformedCode = fixReactTransform(transformResult.code);
  var modularizedCode =
    Modularizer.modularize(modName, transformedCode, resolveModule);
  originalSourceCache[modName] = rawCode;
  transformCache[modName] = modularizedCode;
  transformTimes[modName] = Date.now();
  return transformCache[modName];
};

/**
 * @param {string} str Code resulting from running transforms.
 * @return {string} Fixed string - removes additional trailing newline.
 */
var fixReactTransform = function(str) {
  return str.charAt(str.length - 1) === '\n' ?
    str.substr(0, str.length - 1) : str;
};

function warmCache(orderedModulesObj, modName, done) {
  var mod = orderedModulesObj[modName];
  if (transformTimes[modName] && transformTimes[modName] > mod.mtime) {
    done(null, transformCache[modName]);
  } else {
    fs.readFile(mod.path, {encoding: 'utf8'}, function(err, contents) {
      var error = err || (!contents && '[ERROR] no content:' +  mod.path);
      done(error, !error && transformModuleImpl(mod, modName, contents));
    });
  }
}

/**
 * @param {object} Options - including callback for completion.
 */
var computePackageForAbsolutePath = function(options) {
  /**
   * @param {string} moduleName Resolved module name, corresponding to the
   * absolute path provided as `options.rootModuleAbsolutePath`.
   * @param {Object} orderedModulesObj Key value (topologically ordered) of
   * dependent resources.
   */
  var onModuleDependenciesLoaded =
    function(err, resolvedRootModuleID, orderedModulesObj) {
      if (err) {
        return options.onComputePackageDone(err);
      }
      var moduleNames = Object.keys(orderedModulesObj);
      var onWarmed = function(err) {
        if (err) {return options.onComputePackageDone(err);}
        var ppackage = new Package();
        var modCount = 0;
        moduleNames.forEach(function(modName) {
          var mod = orderedModulesObj[modName];
          var originalSource = originalSourceCache[modName];
          var transformedSource = transformCache[modName];
          modCount = ppackage.push(mod.path, originalSource, transformedSource);
        });
        var packageErr = !modCount &&
            new Error('No modules for:' + options.rootModuleAbsolutePath);
        options.onComputePackageDone(packageErr, resolvedRootModuleID, ppackage);
      };
      async.each(
        moduleNames,
        warmCache.bind(null, orderedModulesObj),
        onWarmed
      );
    };

  HasteDependencyLoader.loadOrderedDependencies({
    resourceTypeStrings: validJSDependencyTypeStrings,
    rootJSPath: options.rootModuleAbsolutePath,
    haste: getHasteInstance(options.buildConfig),
    resourceMap: getResourceMapInstance(options.buildConfig),
    done: onModuleDependenciesLoaded,
    debug: options.buildConfig.debugPackager
  });
};

var Packager = {
  computePackageForAbsolutePath: computePackageForAbsolutePath
};

module.exports = Packager;
