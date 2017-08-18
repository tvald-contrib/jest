/**
 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */

import type {Path} from 'types/Config';

import browserResolve from 'browser-resolve';

type ResolverOptions = {|
  basedir: Path,
  browser?: boolean,
  extensions?: Array<string>,
  moduleDirectory?: Array<string>,
  paths?: ?Array<Path>,
|};

function defaultResolver(path: Path, options: ResolverOptions) {
  const resolve = options.browser ? browserResolve.sync : resolveSync;

  return resolve(path, {
    basedir: options.basedir,
    extensions: options.extensions,
    moduleDirectory: options.moduleDirectory,
    paths: options.paths,
  });
}

module.exports = defaultResolver;

var fs = require('fs');
var path = require('path');

function resolveSync(x, options) {
  if (typeof x !== 'string') {
    throw new TypeError('Path must be a string.');
  }
  var opts = options || {};
  var isFile = opts.isFile || function (file) {
    try {
      var stat = fs.statSync(file);
    } catch (e) {
      if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return false;
      throw e;
    }
    return stat.isFile() || stat.isFIFO();
  };
  var readFileSync = opts.readFileSync || fs.readFileSync;

  var extensions = opts.extensions || ['.js'];
  var y = opts.basedir; // guaranteed to be defined

  opts.paths = opts.paths || [];

  if (/^(?:\.\.?(?:\/|$)|\/|([A-Za-z]:)?[/\\])/.test(x)) {
    var res = path.resolve(y, x);
    if (x === '..' || x.slice(-1) === '/') res += '/';
    var m = loadAsFileSync(res) || loadAsDirectorySync(res);
    if (m) return m;
  } else {
    var n = loadNodeModulesSync(x, y);
    if (n) return n;
  }

  // don't worry about built-in modules, we won't be asked to resolve these

  var err = new Error("Cannot find module '" + x + "' from '" + y + "'");
  err.code = 'MODULE_NOT_FOUND';
  throw err;

  function loadAsFileSync(x) {
    if (isFile(x)) {
      return x;
    }

    for (var i = 0; i < extensions.length; i++) {
      var file = x + extensions[i];
      if (isFile(file)) {
        return file;
      }
    }
  }

  function loadAsDirectorySync(x) {
    var pkgfile = path.join(x, '/package.json');
    if (isFile(pkgfile)) {
      try {
        var body = readFileSync(pkgfile, 'UTF8');
        var pkg = JSON.parse(body);

        if (opts.packageFilter) {
          pkg = opts.packageFilter(pkg, x);
        }

        if (pkg.main) {
          if (pkg.main === '.' || pkg.main === './') {
            pkg.main = 'index';
          }
          var m = loadAsFileSync(path.resolve(x, pkg.main));
          if (m) return m;
          var n = loadAsDirectorySync(path.resolve(x, pkg.main));
          if (n) return n;
        }
      } catch (e) { }
    }

    return loadAsFileSync(path.join(x, '/index'));
  }

  function loadNodeModulesSync(x, start) {
    var dirs = nodeModulesPaths(start, opts);
    for (var i = 0; i < dirs.length; i++) {
      var dir = dirs[i];
      var m = loadAsFileSync(path.join(dir, '/', x));
      if (m) return m;
      var n = loadAsDirectorySync(path.join(dir, '/', x));
      if (n) return n;
    }
  }

  function nodeModulesPaths(start, opts) {
    var modules = opts && opts.moduleDirectory
      ? [].concat(opts.moduleDirectory)
      : ['node_modules'];

    // ensure that `start` is an absolute path at this point,
    // resolving against the process' current working directory
    var absoluteStart = path.resolve(start);

    if (opts && opts.preserveSymlinks === false) {
      try {
        absoluteStart = fs.realpathSync(absoluteStart);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
    }

    var prefix = '/';
    if (/^([A-Za-z]:)/.test(absoluteStart)) {
      prefix = '';
    } else if (/^\\\\/.test(absoluteStart)) {
      prefix = '\\\\';
    }

    var paths = [absoluteStart];
    var parsed = path.parse(absoluteStart);
    while (parsed.dir !== paths[paths.length - 1]) {
      paths.push(parsed.dir);
      parsed = path.parse(parsed.dir);
    }

    var dirs = paths.reduce(function (dirs, aPath) {
      return dirs.concat(modules.map(function (moduleDir) {
        return path.join(prefix, aPath, moduleDir);
      }));
    }, []);

    return opts && opts.paths ? dirs.concat(opts.paths) : dirs;
  };
};
