'use strict';

var fs = require('fs');
var path = require('path');

exports.enableCaching = true;
exports.templateDir = path.join(process.cwd(), 'views');
exports.templateExt = '.garnet';

var templateCache = { };

var normalizeTemplatePath = function(templatePath, currentDir) {
  var normalizedTemplatePath = templatePath;
  var realCurrentDir = currentDir;

  // add an extension if none present
  if (path.extname(normalizedTemplatePath) === '') {
    normalizedTemplatePath += exports.templateExt;
  }

  // if no directory specified, use the default
  if (typeof realCurrentDir === 'undefined') {
    realCurrentDir = exports.templateDir;
  }

  // if relative path, convert to absolute
  if (normalizedTemplatePath[0] !== '/') {
    normalizedTemplatePath = path.join(realCurrentDir, normalizedTemplatePath);
  }

  // fix double slashes, take care of '.' and '..', etc.
  return path.normalize(normalizedTemplatePath);
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

exports.compile = function(templatePath) {
  var normalizedTemplatePath = normalizeTemplatePath(templatePath);

  // check if the template is already compiled
  if (exports.enableCaching && templateCache.hasOwnProperty(normalizedTemplatePath)) {
    return templateCache[normalizedTemplatePath];
  }

  // load the template from disk
  var templateStr = fs.readFileSync(normalizedTemplatePath, { encoding: 'utf8' });

  // items in this array alternate between raw text and template code
  var parts = [];

  // alternate between parsing text and code
  var pos = 0;
  while (true) {
    // add the next text part and check for syntax errors
    var openPos = templateStr.indexOf('<%', pos);
    var closePos = templateStr.indexOf('%>', pos);
    if (openPos === -1) {
      if (closePos === -1) {
        parts.push(templateStr.slice(pos));
        break;
      } else {
        throw new Error('Unexpected \'%>\' at position ' + String(closePos) + ' in template ' + normalizedTemplatePath + '.');
      }
    } else {
      if (closePos === -1) {
        throw new Error('Missing \'%>\' in template ' + normalizedTemplatePath + '.');
      } else {
        if (closePos < openPos) {
          throw new Error('Unexpected \'%>\' at position ' + String(closePos) + ' in template ' + normalizedTemplatePath + '.');
        } else {
          parts.push(templateStr.slice(pos, openPos));
          var nextOpenPos = templateStr.indexOf('<%', openPos + 2);
          if (nextOpenPos !== -1 && nextOpenPos < closePos) {
            throw new Error('Unexpected \'<%\' at position ' + String(nextOpenPos) + ' in template ' + normalizedTemplatePath + '.');
          }
        }
      }
    }

    // add the following code part
    parts.push(templateStr.slice(openPos + 2, closePos));
    pos = closePos + 2;
  }

  // compile the template
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
  var render = function(partialPath, locals) {
    var normalizedPartialPath = normalizeTemplatePath(partialPath, path.dirname(normalizedTemplatePath));
    return exports.compile(normalizedPartialPath)(locals);
  };

  // construct the template function
  var template = function(locals) {
    var templateFn = new Function('sanitizeForHTML', 'render', 'locals', body);
    return templateFn(sanitizeForHTML, render, locals);
  };

  // cache the compiled template if caching is enabled
  if (exports.enableCaching) {
    templateCache[normalizedTemplatePath] = template;
  }

  return template;
};

// for Express
exports.__express = function(templatePath, locals, callback) {
  try {
    return callback(null, exports.compile(templatePath)(locals));
  } catch (e) {
    return callback(e);
  }
}
