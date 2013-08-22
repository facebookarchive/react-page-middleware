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
var Haste = require('node-haste/lib/Haste');
var HasteDependencyLoader = require('node-haste/lib/HasteDependencyLoader');
var Modularizer = require('./Modularizer');
var Package = require('./Package');
var ProjectConfigurationLoader = require('node-haste/lib/loader/ProjectConfigurationLoader');
var ResourceMap = require('node-haste/lib/ResourceMap');

var async = require('async');
var fs = require('fs');
var hasteLoaders = require('node-haste/lib/loaders');
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

/**
 * Fast startsWith implementation.
 */
var startsWith = function(str, searchString) {
  if (str.length < searchString.length) {
    return false;
  }
  for (var i = 0; i < searchString.length; i++) {
    if (str[i] !== searchString[i]) {
      return false;
    }
  }
  return true;
};

var AUTO_BLACKLIST = ['.DS_Store', '.git', '.module-cache'];

var replaceDot = function(str) {
  return str.replace(/\./g, function() {
    return '\\.';  // escape the dots.
  });
};

var AUTO_BLACKLIST_RE =
  new RegExp('(' +
    AUTO_BLACKLIST.map(function(itm) {
      return replaceDot(itm);
    }).join('|') +
  ')');

/**
 * In general, we'll never permit node_modules to be packaged up, unless you
 * whitelist them, and even then we will only whitelist one node_modules level.
 * This just helps to avoid accidentally packaging something huge.
 * /Users/you/github/react-page/node_modules/whitelisted/thing.js
 * /Users/you/github/react-page/node_modules/whitelisted/node_modules
 * \---------------------------------------------------/
 * Even if thing.js is whitelisted, whitelisted/node_modules/* will not be.
 *
 * We'll search every whitelisted search root to see if this path falls
 * somewhere under that search root without an additional /node_modules/ - if so
 * return true.
 */
var isWhitelistedUnderSearchPaths = function(path, jsSourcePaths) {
  for (var i = 0; i < jsSourcePaths.length; i++) {
    var searchRoot = jsSourcePaths[i];
    if (startsWith(path, searchRoot) &&
      !path.substr(searchRoot.length).match(/\/node_modules\//g)) {
      return true;
    }
  }
  return false;
};

/**
 * We must make sure to add react-page-middleware to the ignored search paths,
 * otherwise a prebuilt version of React (which still has @providesModule React)
 * could end up getting bundled with the pure version. Not only would it be
 * wasteful, but the built version requires in the form of (./Module) which
 * would fail.  We'll also filter build/modules/ which is a common place for
 * React build output.
 */
var getHasteInstance = function(buildConfig) {
  if (hasteInstance) {
    return hasteInstance;
  }
  var jsSourcePaths = buildConfig.jsSourcePaths;
  var loaders = [
    new hasteLoaders.JSLoader({    // JS files
      extractSpecialRequires: true // support for requireLazy, requireDynamic
    }),
    new hasteLoaders.CSSLoader({}), // CSS files
    new ProjectConfigurationLoader() // package.json files
  ];
  var hasteOptions = {
    ignorePaths: function(path) {
      return AUTO_BLACKLIST_RE.test(path) ||
        !isWhitelistedUnderSearchPaths(path, jsSourcePaths) ||
        buildConfig.ignorePaths && buildConfig.ignorePaths(path);
    }
  };
  return new Haste(loaders, jsSourcePaths, hasteOptions);
};

/**
 * Replaces relative modules, transforms JSX, and wraps each module in a
 * `define()`.
 */
var transformModuleImpl = function(mod, modName, rawCode) {
  var resolveModule = function(requiredName) {
    return mod.getModuleIDByOrigin(requiredName);
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
