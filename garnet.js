var fs = require('fs');
var path = require('path');

var fileCache = { };
var codeCache = { };
var toCache = { };

exports.enableCaching = true;
exports.templateDir = path.join(process.cwd(), 'views');
exports.templateExt = '.garnet';

var normalizeTemplatePath = function(templatePath, currentDir) {
  templatePath = path.normalize(templatePath);
  if (path.extname(templatePath) === '') {
    templatePath += exports.templateExt;
  }
  if (typeof currentDir === 'undefined') {
    currentDir = exports.templateDir;
  }
  if (templatePath[0] !== '/') {
    templatePath = path.join(currentDir, templatePath);
  }
  return templatePath;
}

var sanitizeForString = function(str) {
  return str.replace(/'/g, '\\\'').replace(/"/g, '\\\"').replace(/\n/g, '\\n');
}

var sanitizeForHTML = function(str) {
  return str
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

var getTemplateParts = function(str, skipDependencyDeclarations) {
  var rawParts = str.split('%');

  // treat '%%' as an escaped '%'
  var escapedParts = [];
  for (var i = 0; i < rawParts.length; i++) {
    if (i + 2 < rawParts.length && rawParts[i + 1].length === 0) {
      escapedParts.push(rawParts[i] + '%' + rawParts[i + 2]);
      i += 2;
    } else {
      escapedParts.push(rawParts[i]);
    }
  }

  if (skipDependencyDeclarations) {
    // skip '%@ ... %'
    var partsWithoutDependencies = [];
    for (var i = 0; i < escapedParts.length; i++) {
      if (i % 2 === 1 && escapedParts[i].length > 0 && escapedParts[i][0] === '@') {
        if (i + 1 < escapedParts.length) {
          partsWithoutDependencies[partsWithoutDependencies.length - 1] += escapedParts[i + 1];
          i++;
        }
      } else {
        partsWithoutDependencies.push(escapedParts[i]);
      }
    }
    return partsWithoutDependencies;
  } else {
    return escapedParts;
  }
}

var warmFileCache = function(templatePath, callback) {
  templatePath = normalizeTemplatePath(templatePath);
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

  var warmFileCacheRecurse = function(filePath) {
    filePath = normalizeTemplatePath(filePath, path.dirname(templatePath));

    if (fileCache.hasOwnProperty(filePath)) {
      done();
      return;
    }

    fs.readFile(filePath, { encoding: 'utf8' }, function(err, template) {
      if (err) {
        done(err);
        return;
      }

      var parts = getTemplateParts(template, false);
      for (var i = 1; i < parts.length; i += 2) {
        if (parts[i].length > 0 && parts[i][0] === '@') {
          refCount += 1;
          var partialPath = normalizeTemplatePath(parts[i].slice(1).replace(/^\s+|\s+$/g, ''), path.dirname(filePath));
          warmFileCacheRecurse(partialPath);
        }
      }
      fileCache[filePath] = template;
      done();
    });
  };

  warmFileCacheRecurse(templatePath);
}

var compile = function(templatePath) {
  templatePath = normalizeTemplatePath(templatePath);

  if (codeCache.hasOwnProperty(templatePath)) {
    return codeCache[templatePath];
  }

  if (!fileCache.hasOwnProperty(templatePath)) {
    throw new Error('Template ' + templatePath + ' must be loaded in fileCache before compilation.');
  }

  codeCache[templatePath] = function() { };

  var template = fileCache[templatePath];
  var parts = getTemplateParts(template, true);

  if (parts.length % 2 === 0) {
    throw new Error('Missing \'%\' in template ' + templatePath + '.');
  }

  var body = 'var result=\'' + sanitizeForString(parts[0]) + '\';';
  for (var i = 1; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (parts[i].length > 0) {
        body += 'result+=\'' + sanitizeForString(parts[i]) + '\';';
      }
    } else {
      if (parts[i].length > 0 && parts[i][0] === '=') {
        body += 'result+=sanitizeForHTML(String(' + parts[i].slice(1).replace(/^\s+|\s+$/g, '') + '\n));';
      } else if (parts[i].length > 0 && parts[i][0] === '-') {
        body += 'result+=String(' + parts[i].slice(1).replace(/^\s+|\s+$/g, '') + '\n);';
      } else {
        body += parts[i].replace(/^\s+|\s+$/g, '') + ';\n';
      }
    }
  }
  body += 'return result;';

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

  codeCache[templatePath] = function(locals) {
    var templatefn = new Function('sanitizeForHTML', 'render', 'locals', body);
    return templatefn(sanitizeForHTML, render, locals);
  };

  return codeCache[templatePath];
}

exports.require = function(templatePath) {
  toCache[normalizeTemplatePath(templatePath)] = true;
}

exports.render = function(templatePath, locals, callback) {
  // asynchronously load all the paths in toCache
  if (Object.keys(toCache).length > 0) {
    arbitraryPath = Object.keys(toCache)[0];
    delete toCache[arbitraryPath];
    warmFileCache(arbitraryPath, function(err) {
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
  warmFileCache(templatePath, function(err) {
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
}

// for Express
exports.__express = exports.render
