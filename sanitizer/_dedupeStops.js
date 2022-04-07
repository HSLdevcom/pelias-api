// validate inputs, convert types and apply defaults
function sanitize( raw, clean ){

  // error & warning messages
  var messages = { errors: [], warnings: [] };

  // valid input 'dedupestops'
  if(raw.dedupestops === '1' ) {
    clean.dedupestops = raw.dedupestops;
  }

  return messages;
}


function expected() {
  // add deduping as a valid parameter
  return [{ name: 'dedupestops' }];
}

// export function
module.exports = () => ({
  sanitize: sanitize,
  expected: expected
});

