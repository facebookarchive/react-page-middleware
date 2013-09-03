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

var Packager = require('./Packager');
var Modularizer = require('./Modularizer');

var consts = require('./consts');
var convertSourceMap = require('convert-source-map');
var fs = require('fs');
var guard = require('./guard');
var path = require('path');
var renderReactPage = require('./renderReactPage');
var url = require('url');

var Chart = require('./Chart');

var devBlock = function(buildConfig) {
  return '__DEV__ = ' + (buildConfig.dev ? ' true;\n' : 'false;\n');
};

var JS_TYPE = 'application/javascript';
var HTML_TYPE = 'text/html';

var merge = function(one, two) {
  var ret = {};
  for (var key in one) {
    ret[key] = one[key];
  }
  for (key in two) {
    ret[key] = two[key];
  }
  return ret;
};

var validateBuildConfig = function(buildConfig) {
  var middlewarePath =
    path.resolve(buildConfig.projectRoot, 'node_modules', 'react-page-middleware');
  var browserBuiltinsPath =
    path.resolve(middlewarePath, 'node_modules', 'browser-builtins');
  if (buildConfig.useBrowserBuiltins && buildConfig.blacklistRE &&
    buildConfig.blacklistRE.test(browserBuiltinsPath)) {
    throw new Error(
      'You have blacklisted the browser builtins directory (' +
      browserBuiltinsPath + ')' +
      ' but you have set `useBrowserBuiltins` to be true');
  }
  // Substring/indexOf is actually a flawed way to infer folder hierarchy!
  if (buildConfig.pageRouteRoot.indexOf(buildConfig.projectRoot) !== 0) {
    throw new Error('pageRouteRoot must be prefix of projectRoot');
  }
  if (!fs.existsSync(buildConfig.projectRoot)) {
    throw new Error('ERROR: No root:' + buildConfig.projectRoot);
  }
};

/**
 * Bundle the require implementation
 */
var REQUIRE_RUNTIME_PATH = path.resolve(__dirname, '..', 'polyfill/require.js');
var PROCESS_RUNTIME_PATH = path.resolve(
  __dirname,
  '..',
  'node_modules',
  'browser-builtins',
  'builtin',
  'process.js'
);
var REQUIRE_RUNTIME = fs.readFileSync(REQUIRE_RUNTIME_PATH, 'utf8');
var PROCESS_RUNTIME =
  Modularizer.modularize('process', fs.readFileSync(PROCESS_RUNTIME_PATH, 'utf8')) +
  ' process = require("process");'; // Make it global.

/**
 * TODO: We may need to call next here, if we want to allow something like a
 * gzip plugin.
 */
function send(type, res, str, mtime) {
  res.setHeader('Date', new Date().toUTCString());
  // Always assume we had compiled something that may have changed.
  res.setHeader('Last-Modified', mtime || (new Date()).toUTCString());
  res.setHeader('Content-Length', str.length);
  res.setHeader('Content-Type', type);
  res.end(str);
}


/**
 * TODO: Know when a package already has the require system, and other
 * dependencies.
 * @param {Package} ppackage Appends module system etc.
 * @param {BuildConfig} buildConfig Options for building.
 */
var appendPackagePrereqs = function(ppackage, buildConfig) {
  var devStr = devBlock(buildConfig);
  if (buildConfig.useBrowserBuiltins) {
    ppackage.unshift(PROCESS_RUNTIME_PATH, PROCESS_RUNTIME, PROCESS_RUNTIME);
  }
  ppackage.unshift(REQUIRE_RUNTIME_PATH, REQUIRE_RUNTIME, REQUIRE_RUNTIME);
  ppackage.unshift('/dynamically-generated.js', devStr, devStr);
};

/**
 * @param {object} packageOptions Options - see
 * `Packager.computePackageForAbsolutePath` argument.
 * @param {object} timingData Mutated timing data.
 * @param {function} next When completed.
 */
var computeBundleForAbsolutePath = function(packageOptions, timingData, next) {
  if (packageOptions.onComputePackageDone) {
    next('computeBundleForAbsolutePath provides that handler - not you');
  }
  var buildConfig = packageOptions.buildConfig;
  // Add to the `onComputePackageDone` callback.
  Packager.computePackageForAbsolutePath(merge(packageOptions, {
    onComputePackageDone: guard(next, function(rootModuleID, ppackage) {
      appendPackagePrereqs(ppackage, buildConfig);
      timingData.findEnd = Date.now();
      var packageText = ppackage.getSealedText(buildConfig.useSourceMaps);
      timingData.concatEnd = Date.now();
      var sourceMapComment =
        !buildConfig.useSourceMaps ? '' : convertSourceMap.fromObject(
            ppackage.getSealedSourceMaps().toJSON()
        ).toComment();
      timingData.sourceMapEnd = Date.now();
      var bundleText = !buildConfig.useSourceMaps ?
        packageText : packageText + sourceMapComment;
      next(null, rootModuleID, ppackage, bundleText);
    })
  }));
};


/**
 * Handles generating "an entire page" of markup for a given route.
 *
 * - First, generates the markup and renders it server side. Will never generate
 *   source maps, unless an error occurs - then they are generated lazily.
 * - That markup is sent, then another request is made for the JS. If
 *   `useSourceMaps` is true in the `buildConfig`, then these will be generated
 *   at this point - it does not block initial page render since server
 *   rendering happens without them.
 *
 * @param {object} buildConfig Build config options.
 * @param {Route} route Contains information about the component to render and
 * what type of resource needs to be generated.
 * @param {function} next When complete.
 */
var handlePageComponentRender = function(buildConfig, route, next) {
  var timingData = {pageStart: Date.now()};
  var renderedBundledText = function(rootModuleID, ppackage, bundleText) {
    var props =  route.additionalProps || {};
    renderReactPage({
      originatingRoute: route,
      rootModuleID: rootModuleID,
      props: props,
      bundleText: bundleText,
      ppackage: ppackage,
      timingData: timingData,
      /**
       * @param {Error} err Error that occured.
       * @param {string} markup Markup result.
       */
      done: function(err, markup) {
        timingData.markupEnd = Date.now();
        next(err, markup);
        timingData.serveEnd = Date.now();
        if (buildConfig.logTiming) {
          Chart.logSummary(route.normalizedRequestPath, ppackage.resourceCount());
          Chart.logPageServeTime(timingData);
        }
      }
    });
  };

  var onComputeBundle = guard(next, renderedBundledText);
  var packageOptions = {
    // Disable sourcemaps for server rendering - we compute them lazily upon an
    // error.
    buildConfig: merge(buildConfig, {useSourceMaps: false}),
    rootModuleAbsolutePath: route.pageComponentAbsolutePath
  };
  computeBundleForAbsolutePath(packageOptions, timingData, onComputeBundle);
};

/**
 * Handles generating and serving a JS resource that corresponds to a whole-page
 * component rendering.
 *
 * @param {object} buildConfig Build config options.
 * @param {Route} route Contains information about the component to render and
 * what type of resource needs to be generated.
 * @param {function} next When complete.
 */
var handlePageComponentBundle = function(buildConfig, route, next) {
  var timingData = {pageStart: Date.now()};
  var serveBundle = function(rootModuleID, ppackage, bundleText) {
    next(null, bundleText);
    timingData.serveEnd = Date.now();
    if (buildConfig.logTiming) {
      Chart.logBundleServeTime(timingData);
    }
  };
  var onComputeBundle = guard(next, serveBundle);
  var packageOptions = {
    buildConfig: buildConfig,
    rootModuleAbsolutePath: route.pageComponentAbsolutePath
  };
  computeBundleForAbsolutePath(packageOptions, timingData, onComputeBundle);
};

exports.provide = function provide(buildConfig) {
  validateBuildConfig(buildConfig);
  /**
   * TODO: We can cache sign the module cache with a particular web request ID.
   * We generate a page with request ID x, and include a script
   * src="main.js?pageRenderedWithRequestID=x" so we know that we can somehow use
   * that old module version, saving a module cache invalidation.
   */
  return function provideImpl(req, res, next) {
    if (req.method !== 'GET') {
      return next();
    }
    var componentRouter = buildConfig.componentRouter || exports.defaultRouter;

    var serveMarkup = guard(next, send.bind(null, HTML_TYPE, res));
    var serveBundle = guard(next, send.bind(null, JS_TYPE, res));

    componentRouter(buildConfig, req.url, function(err, route) {
      if (err || !route) {
        return next(err);
      }
      return (
        route.type === 'htmlRequest' ?
          handlePageComponentRender(buildConfig, route, serveMarkup) :
        route.type === 'bundle' ?
          handlePageComponentBundle(buildConfig, route, serveBundle) :
        next('unrecognized route')
      );
    });
  };
};

/**
 * @param {object} buildConfig The same build config object used everywhere.
 * @return {function} Function that when invoked with the absolute path of a web
 * request, will return the response that would normally be served over the
 * network.
 *
 *   > require('react-page-middleware')
 *   >  .compute({buildConfigOptions})
 *   >    ('path/to/x.html', console.log.bind(console))
 *
 *   <  <html><body>...</body></html>
 *
 * Can also be used to compute JS bundles.
 */
exports.compute = function(buildConfig) {
  validateBuildConfig(buildConfig);
  return function(requestedPath, onComputed) {
    if (!requestedPath) {
      throw new Error('Must supply file to compute build from:');
    }
    var mockRequestedURL = 'http://localhost:8080/' + requestedPath;
    var componentRouter = buildConfig.componentRouter || exports.defaultRouter;
    componentRouter(buildConfig, mockRequestedURL, function(err, route) {
      var done = function(err, result) {
        if (err) {
          throw err;
        } else {
          onComputed(result);
        }
      };
      if (err || !route) {
        return done(err);
      }
      var handler = route.type === 'htmlRequest' ?  handlePageComponentRender :
        route.type === 'bundle' ?  handlePageComponentBundle :
        null;
      handler(buildConfig, route, done);
    });
  };
};

/**
 * The default router uses the `buildConfig.pageRouteRoot` as a way to prefix
 * all component lookups. For example, in the example `server.js`, the
 * `pageRouteRoot` is set to the `src/pages` directory, so
 * http://localhost:8080/index.html => src/pages/index.js
 * http://localhost:8080/about/index.html => src/pages/index.js
 *
 * The same convention is applied to bundle paths, since each page has exactly
 * one bundle. Each generated HTML page automatically pulls in its JS bundle
 * from the client (you don't worry about this).
 *
 * http://localhost:8080/index.bundle => src/pages/index.js(bundled)
 * http://localhost:8080/about/index.bundle => src/pages/index.js(bundled)
 *
 * If no `.bundle` or `.html` is found at the end of the URL, the default router
 * will append `index.html` to the end, before performing the routing convention
 * listed above.
 *
 * So http://localhost:8080/some/path
 * normalized => http://localhost:8080/some/path/index.html
 * rendered   => http://localhost:8080/some/path/index.js
 * bundled   => http://localhost:8080/some/path/index.bundle
 */
var _getDefaultRouteData = function(buildConfig, reqURL) {
  var reqPath = url.parse(reqURL).pathname;
  var hasExtension = consts.HAS_EXT_RE.test(reqPath);
  var endsInHTML = consts.PAGE_EXT_RE.test(reqPath);
  var endsInBundle = consts.PACKAGE_EXT_RE.test(reqPath);
  // default index.html if neither.
  var shouldRouteToPage = endsInHTML || (!hasExtension && !endsInBundle);
  var shouldRouteToBundle = endsInBundle;
  if (reqPath.indexOf('..') !== -1) {
    return null;
  }
  var additionalProps = {
    requestParams: url.parse(reqURL, true).query
  };
  if (shouldRouteToPage) {
    var normalizedRequestPath =
      !endsInHTML ? path.join(reqPath, '/index.html') : reqPath;
    return {
      type: 'htmlRequest',
      normalizedRequestPath: normalizedRequestPath,
      pageComponentAbsolutePath: path.join(
        buildConfig.pageRouteRoot || '',
        // .bundle => .js
        normalizedRequestPath.replace(consts.PAGE_EXT_RE, consts.PAGE_SRC_EXT).
          replace(consts.LEADING_SLASH_RE, '')
      ),
      additionalProps: additionalProps
    };
  } else if (shouldRouteToBundle) {
    return {
      type: 'bundle',
      normalizedRequestPath: reqPath,
      pageComponentAbsolutePath: path.join(
        buildConfig.pageRouteRoot,
        // .bundle => .js
        reqPath.replace(consts.PACKAGE_EXT_RE, consts.PAGE_SRC_EXT).
        replace(consts.LEADING_SLASH_RE, '')
      ),
      additionalProps: additionalProps
    };
  } else {
    return null;
  }
};

exports.defaultRouter = function(buildConfig, reqURL, next) {
  if (!buildConfig.pageRouteRoot) {
    return next('Must specify default router root');
  } else {
    var defaultRouter =  _getDefaultRouteData(buildConfig, reqURL);
    return next(null, defaultRouter);
  }
};
