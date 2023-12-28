const check = require('check-types');
const iso3166 = require('../helper/iso3166');

function _sanitize(raw, clean) {
  // error & warning messages
  var messages = { errors: [], warnings: [] };

  // target input param
  var countries = raw['boundary.country'];

  // If explicitly given, parse country codes. If not, set to FIN
  if (check.assigned(countries)){
    // must be valid string
    if (!check.nonEmptyString(countries)) {
      messages.errors.push('boundary.country is not a string');
      return messages;
    }

    // every item must be a valid ISO 3166 code
    var countriesArray = countries.split(',');
    countriesArray.forEach(country => {
      if (!containsIsoCode(country)) {
        messages.errors.push(country + ' is not a valid ISO2/ISO3 country code');
        return messages;
      }
    });

    // The codes are valid, set boundary.country to array of country codes
    clean['boundary.country'] = countriesArray.map(country => iso3166.iso3Code(country));
  } else { // default behaviour (set FIN)
    clean['boundary.country'] = ['FIN'];
  }

  return messages;
}

function containsIsoCode(isoCode) {
  return iso3166.isISO2Code(isoCode) || iso3166.isISO3Code(isoCode);
}

function _expected(){
  return [{ name: 'boundary.country' }];
}

module.exports = () => ({
  sanitize: _sanitize,
  expected: _expected
});
