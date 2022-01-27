/**
  this module provides extremely basic parsing using two methods.

  note: this code is old and well due for a makover/replacement, we
  are not happy with either of these methods but they remain in place
  for purely legacy reasons.

  'naive parser' provides the following fields:
  'name', 'admin_parts'

  'addressit parser' provides the following fields:
  'unit', 'number', 'street', 'state', 'country', 'postalcode', 'regions'
**/


const addressit = require('addressit');
const _      = require('lodash');
const logger = require('pelias-logger').get('api');
var check = require('check-types');
var normalize = require('../helper/stringUtils').normalize;
var api = require('pelias-config').generate().api;

// ref: https://en.wikipedia.org/wiki/Quotation_mark
const QUOTES = `"'«»‘’‚‛“”„‟‹›⹂「」『』〝〞〟﹁﹂﹃﹄＂＇｢｣`;
const DELIM = ',';
const ADDRESSIT_MIN_CHAR_LENGTH = 4;
const MAX_REGIONS = 3;
const MAX_WORDS = 5;
const MAX_RAW_LEN = 120;

// List of values which should not be included in parsed regions array.
// Usually this includes country name(s) in a national setup.
// FOr example, 'Suomi' in regions array would currently drop confidence
// scores because WOF defines only international country names (Finland)
var filteredRegions;
var cleanRegions;
var postalCodeValidator = function(code) { return true; }; // default = accept everything
var streetNumberValidator = function(code) { return true; };

if (api && api.localization) {
  filteredRegions = api.localization.filteredRegions;
  cleanRegions = api.localization.cleanRegions;
  if(api.localization.postalCodeValidator) {
    var postalRegexp = new RegExp(api.localization.postalCodeValidator);
    postalCodeValidator = function(code) {
      return postalRegexp.test(code);
    };
  }
  if(api.localization.streetNumberValidator) {
    var streetNRegexp = new RegExp(api.localization.streetNumberValidator);
    streetNumberValidator = function(code) {
      return streetNRegexp.test(code);
    };
  }
}

function addAdmin(parsedText, admin) {
  if (parsedText.regions && parsedText.regions.indexOf(admin) > -1) {
    return; // nop
  }
  parsedText.regions = parsedText.regions || [];
  parsedText.regions.push(admin);
}

function assignValidLibpostalParsing(parsedText, fromLibpostal, text) {

  // validate street number
  if(check.assigned(fromLibpostal.number) && streetNumberValidator(fromLibpostal.number) && fromLibpostal.street) {
    parsedText.number = fromLibpostal.number;
  }

  const query = fromLibpostal.query;
  if(query) {
    if(!parsedText.name) {
      parsedText.name = query;
    }
  }

  const street = fromLibpostal.street;
  if(street) {
    var address = street;
    if(parsedText.number ) {
      address = address + ' ' + parsedText.number;

      // plain parsed street is suspicious as Libpostal often maps venue name to street
      // better to search it only via name, if no number is parsed
      parsedText.street = street; // so assign only when number is present
    }
    if(!parsedText.name) {
      parsedText.name = address;
    }

    // do some cleanup
    if (parsedText.regions) {
      var addrIndex = parsedText.regions.indexOf(address);
      if (addrIndex > -1) {
        parsedText.regions.splice(addrIndex, 1);
        if (parsedText.regions.length === 0) {
          delete parsedText.regions;
        }
      }
    }
  }

  const nbrh = fromLibpostal.neighbourhood;
  if(nbrh) {
    parsedText.neighbourhood = nbrh;
    if(parsedText.name && parsedText.name !== nbrh) {
      addAdmin(parsedText, nbrh);
    } else {
      parsedText.name = nbrh;
    }
  }

  var city = fromLibpostal.city;
  if(city) {
    if(parsedText.name && city === parsedText.name + ' ' + parsedText.name) {
      city = parsedText.name;
    }
    parsedText.city = city;
    if(parsedText.name && parsedText.name !== city) {
      addAdmin(parsedText, city);
    } else {
      // if only a single item is parsed, don't duplicate it to 2 search slots
      // why? Because our data does not include small admin areas such as villages
      // and admin match requirement would produce bad scores
      // basically this is a bug in libpostal parsing. Such small places should not
      // get parsed as city
      parsedText.name = city;
    }
  }

  // validate postalcode
  if(check.assigned(fromLibpostal.postalcode) && postalCodeValidator(fromLibpostal.postalcode)) {
    parsedText.postalcode = fromLibpostal.postalcode;
  }
}


// validate texts, convert types and apply defaults
function _sanitize( raw, clean ){

  // error & warning messages
  var messages = { errors: [], warnings: [] };

  // invalid input 'text'
  const text =  _.trim( _.trim( raw.text ), QUOTES );
  if( !_.isString(text) || _.isEmpty(text) ){
    messages.errors.push('invalid param \'text\': text length, must be >0');
  }

  // valid input 'text'
  else {
    clean.parser = 'addressit';
    // valid text
    clean.text = normalize(raw.text);
    if (clean.text && clean.text.length > MAX_RAW_LEN) {
      messages.warnings.push('Too long search string truncated');
      clean.text = clean.text.substring(0, MAX_RAW_LEN);
    }

    // remove anything that may have been parsed before
    var fromLibpostal = clean.parsed_text;
    delete clean.parsed_text;

    // parse text with query parser
    var parsedText = parse(clean);

    // use the libpostal parsed address components if available
    if(check.assigned(fromLibpostal)) {
      assignValidLibpostalParsing(parsedText, fromLibpostal, clean.text);
    }

    // validate search term complexity
    if (parsedText.name && parsedText.name.includes(' ')) {
      parsedText.name = parsedText.name.split(' ').slice(0, MAX_WORDS).join(' ');
    }
    if (parsedText.regions) {
      for (var i=0; i<parsedText.regions.length; i++) {
	if(parsedText.regions[i].includes(' ')) {
	  parsedText.regions[i] = parsedText.regions[i].split(' ').slice(0, MAX_WORDS).join(' ');
	}
      }
    }
    if (parsedText.regions) {
      parsedText.admin_parts = parsedText.regions.join(DELIM + ' ');
    }

    // remove postalcode from city name
    if(check.assigned(parsedText.postalcode) && check.assigned(parsedText.admin_parts) ) {
      parsedText.admin_parts = parsedText.admin_parts.replace(parsedText.postalcode, '');
    }

    if (Object.keys(parsedText).length > 0) {
      clean.parsed_text = parsedText;
    }
  }

  return messages;
}

function parse(clean) {
  var parsedText = {};

  // split query on delimiter, trim tokens and remove empty elements
  var tokens = clean.text.split(DELIM)
                         .map( part => part.trim() )
                         .filter( part => part.length > 0 );

  if( tokens.length > 1 ){
    parsedText.name = tokens[0];
  }

  // join tokens back togther with normalized delimiters
  var joined = tokens.join(`${DELIM} `);

  // query addressit - perform full address parsing
  // except on queries so short they obviously can't contain an address
  if( joined.length >= ADDRESSIT_MIN_CHAR_LENGTH ) {
    var parsed = addressit(joined);

    // copy fields from addressit response to parsed_text
    for( var attr in parsed ){
      if( 'text' === attr ){ continue; } // ignore 'text'
      if( !_.isEmpty( parsed[ attr ] ) && _.isUndefined( parsedText[ attr ] ) ){
        parsedText[ attr ] = parsed[ attr ];
      }
    }
  }

  // if all we found was regions, ignore it as it is not enough information to make smarter decisions
  if( Object.keys(parsedText).length === 1 && !_.isUndefined(parsedText.regions) ){
    logger.debug('AddressIt parsed regions only', {
      parsed: parsedText,
      params: clean
    });

    // return empty parsed_text
    return {};
  }

  // addressit puts 1st parsed part (venue or street name) to regions[0].
  // That is never desirable so drop the first item
  if(cleanRegions && parsedText.regions) {
    if(parsedText.regions.length>1) {
      parsedText.regions = parsedText.regions.slice(1);
    } else {
      delete parsedText.regions;
    }
  }

  // remove undesired region values
  if(parsedText.regions && filteredRegions) {
    parsedText.regions = parsedText.regions.filter(function(value) {
      return(filteredRegions.indexOf(value)===-1);
    });
    if(parsedText.regions.length===0) {
      delete parsedText.regions;
    }
  }
  if(parsedText.regions) {
    // filter region duplicates and validate term count
    parsedText.regions = parsedText.regions.filter(function(item, pos) {
      return parsedText.regions.indexOf(item) === pos;
    });
    if (parsedText.regions.length >= MAX_REGIONS) {
      parsedText.regions = parsedText.regions.slice(0, MAX_REGIONS);
    }
  }

  return parsedText;
}

function _expected(){
  return [{ name: 'text' }];
}

// export function
module.exports = () => ({
  sanitize: _sanitize,
  expected: _expected
});
