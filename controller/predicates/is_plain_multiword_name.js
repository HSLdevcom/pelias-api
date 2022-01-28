const _ = require('lodash');

module.exports = (req, res) => {
  if (req.clean.hasOwnProperty('parsed_text')) {
    if(req.clean.parsed_text.hasOwnProperty('number') && req.clean.parsed_text.hasOwnProperty('street') ||
       req.clean.parsed_text.regions
    ) {
      return false;
    }
    return req.clean.parsed_text.name && req.clean.parsed_text.name.includes(' ');
  }
  return false;
};
