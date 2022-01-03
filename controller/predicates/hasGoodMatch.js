const _ = require('lodash');

// simple and quick logic to decide if nearly perfect match
// was already found, and other (fuzzy etc) queries are not needed

module.exports = (request, response) => {

  var ptext = _.get(request, ['clean', 'parsed_text', 'name']);
  var text = ptext ||  _.get(request, ['clean', 'text']);
  var match = _.get(response, ['data', 0, 'name', 'default']);

  if (Array.isArray(match)) {
    match = match[0];
  }
  if (!text || !match) {
    return true;
  }
  text = text.toLowerCase();
  match = match.toLowerCase();

  return (match.indexOf(text) === 0);
};
