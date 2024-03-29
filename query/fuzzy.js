const _ = require('lodash');
const peliasQuery = require('pelias-query');
var defaults = require('./search_defaults');
const textParser = require('./text_parser_pelias');
const config = require('pelias-config').generate().api;

var adminFields = require('../helper/placeTypes');
var views = { custom_boosts: require('./view/boost_sources_and_layers') };

if (config && config.query && config.query.search && config.query.search.defaults) {
  // merge external defaults if available
  defaults = _.merge({}, defaults, config.query.search.defaults);
}

//------------------------------
// general-purpose search query
//------------------------------
var query = new peliasQuery.layout.FilteredBooleanQuery();

// scoring boost
query.score( peliasQuery.view.phrase );
query.score( peliasQuery.view.focus( peliasQuery.view.phrase ) );
query.score( peliasQuery.view.popularity( peliasQuery.view.phrase ) );

// address components
query.score( peliasQuery.view.address('housenumber') );
query.score( peliasQuery.view.address('street') );
query.score( peliasQuery.view.address('postcode') );

// admin components
query.score( peliasQuery.view.admin_multi_match(adminFields, 'peliasIndexOneEdgeGram') );
query.score( views.custom_boosts( config.customBoosts ) );

// non-scoring hard filters
query.filter( peliasQuery.view.boundary_circle );
query.filter( peliasQuery.view.boundary_rect );
query.filter( peliasQuery.view.boundary_polygon );
query.filter( peliasQuery.view.sources );
query.filter( peliasQuery.view.layers );
query.filter( peliasQuery.view.categories );
query.filter( peliasQuery.view.boundary_country );
query.filter( peliasQuery.view.boundary_gid );

// --------------------------------

/**
  map request variables to query variables for all inputs
  provided by this HTTP request.
**/
function generateQuery( clean ){

  var vs = new peliasQuery.Vars( defaults );

  // input text
  vs.var( 'input:name', clean.text );
  vs.var('multi_match:fuzziness', 'AUTO');

  // sources
  if( _.isArray(clean.sources) && !_.isEmpty(clean.sources) ) {
    vs.var( 'sources', clean.sources);
  }

  // layers
  if( _.isArray(clean.layers) && !_.isEmpty(clean.layers) ) {
    vs.var( 'layers', clean.layers);
  }

  // categories
  if (clean.categories && !_.isEmpty(clean.categories)) {
    vs.var('input:categories', clean.categories);
  }


  if( clean.querySize ) {
    // use smaller fuzzy query to improve speed
    vs.var( 'size', Math.floor(0.5 + clean.querySize/2) );
  } else {
    vs.var( 'size', 5 );
  }

  // focus point
  if( _.isFinite(clean['focus.point.lat']) &&
      _.isFinite(clean['focus.point.lon']) ){
    vs.set({
      'focus:point:lat': clean['focus.point.lat'],
      'focus:point:lon': clean['focus.point.lon']
    });
  }

  // boundary rect
  if( _.isFinite(clean['boundary.rect.min_lat']) &&
      _.isFinite(clean['boundary.rect.max_lat']) &&
      _.isFinite(clean['boundary.rect.min_lon']) &&
      _.isFinite(clean['boundary.rect.max_lon']) ){
    vs.set({
      'boundary:rect:top': clean['boundary.rect.max_lat'],
      'boundary:rect:right': clean['boundary.rect.max_lon'],
      'boundary:rect:bottom': clean['boundary.rect.min_lat'],
      'boundary:rect:left': clean['boundary.rect.min_lon']
    });
  }

  // boundary circle
  // @todo: change these to the correct request variable names
  if( _.isFinite(clean['boundary.circle.lat']) &&
      _.isFinite(clean['boundary.circle.lon']) ){
    vs.set({
      'boundary:circle:lat': clean['boundary.circle.lat'],
      'boundary:circle:lon': clean['boundary.circle.lon']
    });

    if( _.isFinite(clean['boundary.circle.radius']) ){
      vs.set({
        'boundary:circle:radius': Math.round( clean['boundary.circle.radius'] ) + 'km'
      });
    }
  }

  if( clean['boundary.polygon']) {
    vs.var('boundary:polygon', clean['boundary.polygon']);
  }

  // boundary country
  if( _.isArray(clean['boundary.country']) && !_.isEmpty(clean['boundary.country']) ){
    vs.set({
      'boundary:country': clean['boundary.country'].join(' ')
    });
  }

  // boundary gid
  if ( _.isString(clean['boundary.gid']) ){
    vs.set({
      'boundary:gid': clean['boundary.gid']
    });
  }

  // run the address parser
  if( clean.parsed_text ){
    textParser( clean, vs );
  }

  return {
    type: 'fuzzy',
    body: query.render(vs)
  };
}


module.exports = generateQuery;
