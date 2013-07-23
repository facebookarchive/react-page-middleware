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

function createClientScript(relativeJSPath) {
  return (
    '<script>' +
      'var React = require(\'react-core\').React;' +
      'var Component = require(\'' + relativeJSPath + '\');' +
      'document.addEventListener("DOMContentLoaded", function () {'+
        'React.renderComponent(' +
          'Component(),' +
          'document.body' +
        ');' +
      '});' +
    '</script>'
  );
}

function createClientIncludeScript(relativeJSPath) {
  return (
    '<script src="' + relativeJSPath + '"></script>'
  );
}

function renderReactPage(buildConfig, relPath, done) {
  var absPath = path.join(buildConfig.sourceDir, relPath);
  fs.exists(absPath, function(exists) {
    if (!exists) {
      return done(null, null, false);
    }
    try {
      require('./RequireJSXExtension.js');
      var component = require(absPath);
      var React = require('react-core').React;
      React.renderComponentToString(component(), function(renderedString) {
        var jsSources = createClientIncludeScript(relPath);
        // Todo: Don't reflow - and root must be at <html>!
        var jsScripts = createClientScript(relPath);
        var page =
          renderedString.replace('</body>', jsSources + jsScripts + '</body>');
        done(null, page, true);
      });
    } catch (err) {
      done(err, null, null);
    }
  });
}

module.exports = renderReactPage;
