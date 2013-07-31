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

var docblock = require('react-tools/vendor/fbtransform/lib/docblock');
var fs = require('fs');
var jsxTransform = require('react-tools').transform;

var parseDocBlock = function(data) {
  return docblock.parseAsObject(docblock.extract(data));
};

/**
 * .jsx extension support is currently deprecated - may turn it back on
 * eventually.
 */
require.extensions['.js'] = require.extensions['.jsx'] = function(module) {
  var fileContents = fs.readFileSync(module.filename, 'utf8');
  var isJSXExtensionRe = /^.+\.jsx$/;
  var isJSXExtension = isJSXExtensionRe.exec(module.filename);
  var docBlock = parseDocBlock(fileContents);
  var output =
    isJSXExtension || docBlock.jsx ? jsxTransform(fileContents) :
    fileContents;

  module._compile(
    output,
    module.filename
  );
};
