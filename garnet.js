var fs = require('fs');
var path = require('path');

var fileCache = { };
var codeCache = { };
var toCache = { };

exports.enableCaching = true;
exports.templateDir = path.join(process.cwd(), 'views');
exports.templateExt = '.garnet';

var normalizeTemplatePath = function(templatePath, currentDir) {
  // fix double slashes, take care of '.' and '..', etc.
  templatePath = path.normalize(templatePath);

  // add an extension if none present
  if (path.extname(templatePath) === '') {
    templatePath += exports.templateExt;
  }

  // if no directory specified, use the default
  if (typeof currentDir === 'undefined') {
    currentDir = exports.templateDir;
  }

  // if relative path, convert to absolute
  if (templatePath[0] !== '/') {
    templatePath = path.join(currentDir, templatePath);
  }

  return templatePath;
};

var sanitizeForString = function(str) {
  // make the string safe for inclusion in a string
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\\\'')
    .replace(/"/g, '\\\"')
    .replace(/\n/g, '\\n');
};

var sanitizeForHTML = function(str) {
  // make the string safe for inclusion in HTML
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

var getTemplateParts = function(str, skipDependencyDeclarations, templatePath) {
  // items in this array alternate between raw text and template code
  var parts = [];
  var pos = 0;
  while (true) {
    var openPos = str.indexOf('<%', pos);
    var closePos = str.indexOf('%>', pos);
    if (openPos === -1) {
      if (closePos === -1) {
        parts.push(str.slice(pos));
        break;
      } else {
        throw new Error('Unexpected \'%>\' at position ' + String(closePos) + ' in template ' + templatePath + '.');
      }
    } else {
      if (closePos === -1) {
        throw new Error('Missing \'%>\' in template ' + templatePath + '.');
      } else {
        if (closePos < openPos) {
          throw new Error('Unexpected \'%>\' at position ' + String(closePos) + ' in template ' + templatePath + '.');
        } else {
          parts.push(str.slice(pos, openPos));
          var nextOpenPos = str.indexOf('<%', openPos + 2);
          if (nextOpenPos !== -1 && nextOpenPos < closePos) {
            throw new Error('Unexpected \'<%\' at position ' + String(nextOpenPos) + ' in template ' + templatePath + '.');
          }
        }
      }
    }

    parts.push(str.slice(openPos + 2, closePos));
    pos = closePos + 2;
  }

  if (skipDependencyDeclarations) {
    // skip '<%@ ... %>'
    var partsWithoutDependencies = [];
    for (var j = 0; j < parts.length; j++) {
      if (j % 2 === 1 && parts[j].length > 0 && parts[j][0] === '@') {
        if (j + 1 < parts.length) {
          partsWithoutDependencies[partsWithoutDependencies.length - 1] += parts[j + 1];
          j++;
        }
      } else {
        partsWithoutDependencies.push(parts[j]);
      }
    }
    return partsWithoutDependencies;
  } else {
    return parts;
  }
};

var loadDependencies = function(templatePath, callback) {
  templatePath = normalizeTemplatePath(templatePath);

  // we use reference counting to determine when the last async callback happens
  var refCount = 1;

  var done = function(err) {
    if (refCount >= 0) {
      if (err) {
        callback(err);
        refCount = -1;
        return;
      }

      refCount -= 1;
      if (refCount === 0) {
        callback();
      }
    }
  };

  // recursively load dependencies with this function
  var loadDependenciesRecurse = function(filePath) {
    filePath = normalizeTemplatePath(filePath, path.dirname(templatePath));

    if (fileCache.hasOwnProperty(filePath)) {
      done();
      return;
    }

    // read and parse the file
    fs.readFile(filePath, { encoding: 'utf8' }, function(err, template) {
      if (err) {
        done(err);
        return;
      }

      var parts = null;
      try {
        parts = getTemplateParts(template, false, filePath);
      } catch (e) {
        done(e);
      }

      if (parts !== null) {
        // find dependency declarations
        for (var i = 1; i < parts.length; i += 2) {
          if (parts[i].length > 0 && parts[i][0] === '@') {
            // recursively load dependencies
            refCount += 1;
            var partialPath = normalizeTemplatePath(parts[i].slice(1).replace(/^\s+|\s+$/g, ''), path.dirname(filePath));
            loadDependenciesRecurse(partialPath);
          }
        }

        // cache this file
        fileCache[filePath] = template;
        done();
      }
    });
  };

  // start with the input path
  loadDependenciesRecurse(templatePath);
};

// note: this function does not read from disk
// the template file must already be in memory
var compile = function(templatePath) {
  templatePath = normalizeTemplatePath(templatePath);

  // check if the function is already compiled
  if (codeCache.hasOwnProperty(templatePath)) {
    return codeCache[templatePath];
  }

  // prevent circular dependencies from resulting in infinite loops
  codeCache[templatePath] = function() { };

  var template = fileCache[templatePath];
  var parts = getTemplateParts(template, true, templatePath);

  // compile the template to JavaScript
  var resultName = 'r' + String(Math.floor(Math.random() * 1000000000));
  var body = 'var ' + resultName + '=\'' + sanitizeForString(parts[0]) + '\';';
  for (var i = 1; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (parts[i].length > 0) {
        body += resultName + '+=\'' + sanitizeForString(parts[i]) + '\';';
      }
    } else {
      if (parts[i].length > 0 && parts[i][0] === '=') {
        body += resultName + '+=sanitizeForHTML(String(' + parts[i].slice(1).replace(/^\s+|\s+$/g, '') + '\n));';
      } else if (parts[i].length > 0 && parts[i][0] === '-') {
        body += resultName + '+=String(' + parts[i].slice(1).replace(/^\s+|\s+$/g, '') + '\n);';
      } else {
        body += parts[i].replace(/^\s+|\s+$/g, '') + ';\n';
      }
    }
  }
  body += 'return ' + resultName + ';';

  // this function is available in the view for rendering partials
  render = function(filePath, locals) {
    var partialPath = normalizeTemplatePath(filePath, path.dirname(templatePath));
    if (codeCache.hasOwnProperty(partialPath)) {
      return codeCache[partialPath](locals);
    } else {
      if (fileCache.hasOwnProperty(partialPath)) {
        return compile(partialPath)(locals);
      } else {
        throw new Error('Template ' + templatePath + ' does not declare dependency ' + partialPath + '.');
      }
    }
  };

  // cache the compiled template
  codeCache[templatePath] = function(locals) {
    var templatefn = new Function('sanitizeForHTML', 'render', 'locals', body);
    return templatefn(sanitizeForHTML, render, locals);
  };

  return codeCache[templatePath];
};

exports.require = function(templatePath) {
  // mark this path as a dependency
  toCache[normalizeTemplatePath(templatePath)] = true;
};

exports.render = function(templatePath, locals, callback) {
  // asynchronously load all the paths in toCache
  if (Object.keys(toCache).length > 0) {
    arbitraryPath = Object.keys(toCache)[0];
    delete toCache[arbitraryPath];
    loadDependencies(arbitraryPath, function(err) {
      if (err) {
        callback(err);
        return;
      }

      try {
        exports.render(templatePath, locals, callback);
      } catch (e) {
        callback(e);
      }
    });
    return;
  }

  // make sure the template is loaded from disk
  loadDependencies(templatePath, function(err) {
    if (err) {
      callback(err);
      return;
    }

    try {
      // fetch the compiled template (and compile if necessary)
      var fn = compile(templatePath);

      // render the template
      callback(null, fn(locals));

      // clear the cache if caching is disabled
      if (!exports.enableCaching) {
        fileCache = { };
        codeCache = { };
      }
    } catch (e) {
      callback(e);
    }
  });
};

// for Express
exports.__express = exports.render;
