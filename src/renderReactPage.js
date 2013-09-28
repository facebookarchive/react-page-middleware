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
var extractSourceMappedStack = require('./extractSourceMappedStack');

var consts = require('./consts');

function createClientScript(rootModuleID, props) {
  return (
    '<script type="text/javascript">' +
      'require(\'es5-shim/es5-shim.js\');' +
      'require(\'es5-shim/es5-sham.js\');' +
      'var React = require(\'React\');' +
      'var ReactMount = require(\'ReactMount\');' +
      'var Component = require(\'' + rootModuleID + '\');' +
      'ReactMount.allowFullPageRender = true;' +
      'React.renderComponent(' +
        'Component('+ JSON.stringify(props) + '),' +
        'document' +
      ');' +
    '</script>'
  );
}

function createClientIncludeScript(originatingRoute) {
  return (
    '<script type="text/javascript" src="' +
      originatingRoute.normalizedRequestPath
        .replace(consts.PAGE_EXT_RE, '') +
      consts.PACKAGE_EXT + '"> ' +
    '</script><packaged ></packaged>'
  );
}

function createServerRenderScript(rootModuleID, props) {
  return (
    'var React = require(\'React\');' +
    'var Component = require(\'' + rootModuleID + '\');' +
    'React.renderComponentToString(' +
      'Component('+ JSON.stringify(props) + '),' +
      'function(str) {renderResult = str;} '+
    ');'
  );
}

/**
 * @param options {
 *   @property {Route} rout Rout that caused request to arrive here.
 *   @property {string} rootModuleID Module name (that you would require)
 *   @property {Object} props Props for initial construction of the instance.
 *   @property {string} bundleText Preconcatenated bundle text.
 *   @property {Package} ppackage Package containing all deps of component.
 *   @property {function} done Invoke when completed.
 * }
 */
var renderReactPage = function(options) {
  try {
    var sandboxScript = options.bundleText +
      createServerRenderScript(options.rootModuleID, options.props);
    options.timingData && (options.timingData.concatEnd = Date.now());
    var jsSources = createClientIncludeScript(options.originatingRoute);

    // Todo: Don't reflow - and root must be at <html>!
    var jsScripts = createClientScript(options.rootModuleID, options.props);

    if (options.serverRender) {
      var vm = require('vm');
      var sandbox = {renderResult: ''};
      vm.runInNewContext(sandboxScript, sandbox);
      if (sandbox.renderResult.indexOf('</body></html') === -1) {
        throw new Error(
          'Could not figure out where to place react-page <script> tags.' +
          ' Please ensure that there is nothing between </body> and </html>' +
          ' in your app.'
        );
      }
      var page = sandbox.renderResult.replace(
        '</body></html', jsSources + jsScripts + '</body></html'
      );
      options.done(null, page);
    } else {
      var lazyPage = '<html><head>' + jsSources + jsScripts + '</head><body></body></html>';
      options.done(null, lazyPage);
    }
  } catch (err) {
    var sourceMappedStack =
      extractSourceMappedStack(options.ppackage, err.stack);
    options.done(new Error(sourceMappedStack));
  }
};

module.exports = renderReactPage;

