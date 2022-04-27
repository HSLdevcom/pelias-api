const codec = require('pelias-model').codec;

function decodeAddendum(a_dum) {
  let addendum = {};
  for(let namespace in a_dum){
    try {
      addendum[namespace] = codec.decode(a_dum[namespace]);
    } catch( e ){
      // nop
    }
  }
  return addendum;
}

module.exports = decodeAddendum;
