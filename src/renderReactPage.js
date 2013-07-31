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
var fs = require('fs');
var path = require('path');
var consts = require('./consts');

function createClientScript(relativeJSPath, props) {
  return (
    '<script type="text/javascript">' +
      'var React = require(\'react-core\').React;' +
      'var Component = require(\'' + relativeJSPath + '\');' +
      'document.addEventListener("DOMContentLoaded", function () {'+
        'React.renderComponent(' +
          'Component('+ JSON.stringify(props) + '),' +
          'document.body' +
        ');' +
      '});' +
    '</script>'
  );
}

function createClientIncludeScript(relativeJSPath) {
  return (
    '<script ' +
    'type="text/javascript" src="' +
    relativeJSPath.replace(consts.PAGE_SRC_EXT_RE, consts.REACT_PACKAGE_EXT) +
    '"></script><packaged ></packaged>'
  );
}

function renderReactPage(buildConfig, relModulePath, props, done) {
  var absPath = path.join(buildConfig.sourceDir, relModulePath);
  fs.exists(absPath, function(exists) {
    if (!exists) {
      return done(null, null, false);
    }
    try {
      require('./RequireJSXExtension.js');
      var React = require('react-core').React;
      var component = require(absPath);
      var instance = component(props);
      if (!React.isValidComponent(instance)) {
        throw new Error('module ' + relModulePath + ' is not a React component');
      }
      React.renderComponentToString(instance, function(renderedString) {
        var jsSources = createClientIncludeScript(relModulePath);
        // Todo: Don't reflow - and root must be at <html>!
        var jsScripts = createClientScript(relModulePath, props);
        var page =
          renderedString.replace('</body></html', jsSources + jsScripts + '</body></html');
        done(null, page, true);
      });
    } catch (err) {
      done(err, null, null);
    }
  });
}

module.exports = renderReactPage;
