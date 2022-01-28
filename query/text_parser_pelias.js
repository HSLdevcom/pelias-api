var logger = require('pelias-logger').get('api');
var placeTypes = require('../helper/placeTypes');

// all the address parsing logic
function addParsedVariablesToQueryVariables( clean, vs, options ){

  // is it a street address?
  var isStreetAddress = clean.parsed_text.hasOwnProperty('number') && clean.parsed_text.hasOwnProperty('street');
  if( isStreetAddress ){
    vs.var( 'input:name', clean.parsed_text.street + ' ' + clean.parsed_text.number );
  }

  // ?
  else if( clean.parsed_text.admin_parts ) {
    vs.var( 'input:name', clean.parsed_text.name );
  }

  // ?
  else {
    logger.debug( 'chaos monkey asks: what happens now?', {
      params: clean
    });
  }

  // ==== add parsed matches [address components] ====

  // house number
  if( clean.parsed_text.hasOwnProperty('number') ){
    vs.var( 'input:housenumber', clean.parsed_text.number );
  }

  // street name
  if( clean.parsed_text.hasOwnProperty('street') ){
    vs.var( 'input:street', clean.parsed_text.street );
  }

  // postal code
  if( clean.parsed_text.hasOwnProperty('postalcode') ){
    vs.var( 'input:postcode', clean.parsed_text.postalcode );
  }

  // ==== add parsed matches [admin components] ====

  // city
  if( clean.parsed_text.hasOwnProperty('city') ){
    vs.var( 'input:county', clean.parsed_text.city );
  }

  // state
  if( clean.parsed_text.hasOwnProperty('state') ){
    vs.var( 'input:region_a', clean.parsed_text.state );
  }

  // country
  if( clean.parsed_text.hasOwnProperty('country') ){
    vs.var( 'input:country_a', clean.parsed_text.country );
  }

  // ==== deal with the 'leftover' components ====
  // @todo: clean up this code

  // a concept called 'leftovers' which is just 'admin_parts' /or 'regions'.
  var leftoversString = '';
  if( clean.parsed_text.hasOwnProperty('admin_parts') ){
    leftoversString = clean.parsed_text.admin_parts;
  }
  else if( clean.parsed_text.hasOwnProperty('regions') ){
    leftoversString = clean.parsed_text.regions.join(' ');
  } else if(options && options.matchNameToAdmin) {
    leftoversString = clean.parsed_text.name; // apply unparsed text to boost region hits too: 'porin tori'
  }

  // if we have 'leftovers' then assign them to any fields which
  // currently don't have a value assigned.
  if( leftoversString.length ){

    // cycle through fields and set fields which
    // are still currently unset
    placeTypes.forEach( function( key ){
      if( !vs.isset( 'input:' + key ) ){
        vs.var( 'input:' + key, leftoversString );
      }
    });
  }
}

module.exports = addParsedVariablesToQueryVariables;
