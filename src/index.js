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

var packageReactPageResources = require('./packageReactPageResources');
var clearRequireModuleCache = require('./clearRequireModuleCache');
var path = require('path');
var renderReactPage = require('./renderReactPage');
var transformLessAtPath = require('./transformLessAtPath');
var url = require('url');

require('./RequireJSXExtension.js');
require('./RequireTextExtension.js');

/**
 * TODO: Shouldn't we be calling next here, if we want to allow something like a
 * gzip plugin?
 */
function send(type, res, str, mtime) {
  res.setHeader('Date', new Date().toUTCString());
  // Always assume we had compiled something that may have changed.
  res.setHeader('Last-Modified', mtime || (new Date()).toUTCString());
  res.setHeader('Content-Length', str.length);
  res.setHeader('Content-Type', type);
  res.end(str);
}

var LESS_EXT = /\.less[^\/]*$/;
var PAGE_EXT = /\.html[^\/]*$/;
var PACKAGE_EXTENSION = /\.jsx[^\/]*$/;
var PAGE_SRC_EXT = '.jsx';

exports.provide = function provide(buildConfig) {
  if (buildConfig.requireableMarkdown) {
    require('./RequireTextExtension.js');
  }
  /**
   * TODO: We can cache sign the module cache with a particular web request ID.
   * We generate a page with request ID x, and include a script
   * src="main.jx?pageRenderedWithRequestID=x" so we know that we can somehow use
   * that old module version, saving a module cache invalidatino.
   */
  return function provideImpl(req, res, next) {
    var relPath = url.parse(req.url).pathname;
    if (req.method !== 'GET') {
      return next();
    }
    if (relPath.match(PAGE_EXT)) {
      clearRequireModuleCache(buildConfig.sourceDir);
      var relReactPath = relPath.replace(PAGE_EXT, PAGE_SRC_EXT);
      renderReactPage(buildConfig, relReactPath, function (err, markup, exists) {
        return err ? next(err) :
          !exists ? next(null, res) : send('text/html', res, markup);
      });
    } else if (relPath.match(PACKAGE_EXTENSION)) {
      clearRequireModuleCache(buildConfig.sourceDir);
      packageReactPageResources(buildConfig,relPath, function(err, js) {
        return err ? next(err) : send('application/javascript', res, js);
      });
    } else if (relPath.match(LESS_EXT)) {
      var absPath = path.join(buildConfig.sourceDir, relPath);
      transformLessAtPath(buildConfig, absPath, function(err, css) {
        return err ? next(err) : send('text/css', res, css);
      });
    } else {
      return next();
    }
  };
};
