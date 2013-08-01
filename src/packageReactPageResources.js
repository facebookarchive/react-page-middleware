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

var browserify = require('browserify');
var fs = require('fs');
var path = require('path');
var reactify = require('reactify');
var consts = require('./consts');
var textify = require('./textify');

function packageReactPageResources(buildConfig, relBundlePath, done) {
  var shouldExposeReact = consts.REACT_PACKAGE_EXT_RE.test(relBundlePath);
  var relPath =
    relBundlePath.replace(consts.PACKAGE_EXT_RE, consts.PAGE_SRC_EXT)
    .replace(consts.REACT_PACKAGE_EXT_RE, consts.PAGE_SRC_EXT);
  var sourceDir = buildConfig.sourceDir;
  var absPath = path.join(sourceDir, relPath);
  fs.exists(absPath, onExists);
  function onExists(exists) {
    if (!exists) {
      return done('Application JSX does not exist:' + absPath);
    }
    var jsxBrowserify = browserify();
    jsxBrowserify.transform(reactify);
    jsxBrowserify.transform(textify);
    if (shouldExposeReact) {
      jsxBrowserify.require('react-core', {
        expose: 'react-core',
        basedir: sourceDir
      });
    }
    jsxBrowserify.require(absPath, {expose: relPath, basedir: sourceDir});

    var dev = buildConfig.dev;
    var bundleConfig = {transform: reactify, debug: dev}; // Dev for srcmaps!
    jsxBrowserify.bundle(bundleConfig, function (err, bundledJS) {
      if (err) {
        return done(err);
      }
      done(null, bundledJS + ';require("' + relPath +'");');
    });
  }
}

module.exports = packageReactPageResources;

