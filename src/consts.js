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

module.exports = {
  // Some pages might want to expose react-core as an export.
  // This indicates to the dynamic packaging endpoint that this is what we want.
  REACT_PACKAGE_EXT: '.reactBundle.js',
  REACT_PACKAGE_EXT_RE: /\.reactBundle\.js[^\/]*$/g,

  PACKAGE_EXT: '.bundle.js',
  PACKAGE_EXT_RE: /\.bundle\.js[^\/]*$/g,
  PAGE_SRC_EXT: '.js',
  PAGE_SRC_EXT_RE: /\.js[^\/]*$/g,
  PAGE_EXT_RE: /\.html[^\/]*$/,
  LESS_EXT_RE: /\.less[^\/]*$/
};
