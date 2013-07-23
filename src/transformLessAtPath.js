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
var less = require('less');
var path = require('path');


function transformLessAtPath(buildConfig, sourcePath, done) {
  fs.readFile(sourcePath, 'UTF8', function (err, source) {
    if (err) return done(err);
    transformLess(buildConfig, sourcePath, source, done);
  });
}

function transformLess(buildConfig, sourcePath, source, done) {
  var basePath = buildConfig.sourceDir;
  var dev = buildConfig.dev;
  var parser = new less.Parser({
    paths: [path.dirname(sourcePath)],
    filename: path.relative(basePath, sourcePath)
  });
  parser.parse(source, function (err, lessAST) {
    if (err) return done(null, err);
    try {
      var cssString = lessAST.toCSS({compress: !dev});
      done(null, cssString);
    } catch (error) {
      console.trace(error);
      done(
        null,
        'body:before{background:red;color:white;font-size:24px;'+
        'content:"Less ' + error + '"}'
      );
    }
  });
}

module.exports = transformLessAtPath;
