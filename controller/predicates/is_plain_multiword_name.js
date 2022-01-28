const _ = require('lodash');

module.exports = (req, res) => {
  if (req.clean.hasOwnProperty('parsed_text')) {
    // do not match name with admins if name is a street addr or explict admin value was parsed from text
    if(req.clean.parsed_text.hasOwnProperty('number') && req.clean.parsed_text.hasOwnProperty('street') ||
       req.clean.parsed_text.regions
    ) {
      return false;
    }
    // no street, no admins - maybe the name itself includes an admin: 'Vilppulan asema'
    return req.clean.parsed_text.name && req.clean.parsed_text.name.includes(' ');
  }
  return false;
};
