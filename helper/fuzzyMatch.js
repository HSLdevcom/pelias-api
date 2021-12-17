var stringUtils = require('../helper/stringUtils');
var normalize = stringUtils.normalize;
var removeSpaces = stringUtils.removeSpaces;

/* Jaro-Winkler algo returns 1.0 only when strings are identical
   Totally different strings return 0.
*/

var jw  = function (s1, s2) {
  var m = 0;

  // Exit early if either are empty.
  if ( s1.length === 0 || s2.length === 0 ) {
    return 0;
  }

  // Exit early if they're an exact match.
  if ( s1 === s2 ) {
    return 1;
  }

  var range = (Math.floor(Math.max(s1.length, s2.length) / 2)) - 1,
      s1Matches = new Array(s1.length),
      s2Matches = new Array(s2.length);

  var i, j;

  for (i = 0; i < s1.length; i++) {
    let low  = (i >= range) ? i - range : 0,
        high = (i + range <= s2.length) ? (i + range) : (s2.length - 1);

    for (j = low; j <= high; j++ ) {
      if ( s1Matches[i] !== true && s2Matches[j] !== true && s1[i] === s2[j] ) {
        ++m;
        s1Matches[i] = s2Matches[j] = true;
        break;
      }
    }
  }

  // Exit early if no matches were found.
  if ( m === 0 ) {
    return 0;
  }

  // Count the transpositions.
  let k = 0;
  let n_trans = 0;

  for (i = 0; i < s1.length; i++ ) {
    if ( s1Matches[i] === true ) {
      for (j = k; j < s2.length; j++ ) {
        if ( s2Matches[j] === true ) {
          k = j + 1;
          break;
        }
      }

      if ( s1[i] !== s2[j] ) {
        ++n_trans;
      }
    }
  }

  let weight = (m / s1.length + m / s2.length + (m - (n_trans / 2)) / m) / 3,
      l = 0,
      p = 0.1;

  if ( weight > 0.7 ) {
    while ( s1[l] === s2[l] && l < 4 ) {
      ++l;
    }

    weight = weight + l * p * (1 - weight);
  }

  return weight;
};

var cachedPermutation = {}; // one item cache

// Generating permutation using heap algorithm
function heapPermutation(a, size, n, result)
{
  // if size becomes 1 then collect the obtained permutation
  if (size === 1) {
    result.push(a.join(''));
  } else for (let i = 0; i < size; i++) {
    heapPermutation(a, size - 1, n, result);

    // if size is odd, swap 0th i.e (first) and (size-1)th i.e (last) element
    if (size % 2 === 1) {
      let temp = a[0];
      a[0] = a[size - 1];
      a[size - 1] = temp;
    }

    // If size is even, swap ith and (size-1)th i.e last element
    else {
      let temp = a[i];
      a[i] = a[size - 1];
      a[size - 1] = temp;
    }
  }
}

function _fuzzyMatch(text1, text2) {
  // at the lowest match level, consider spaces insignificant. east west pub = eastwestpub
  text1 = removeSpaces(text1);
  text2 = removeSpaces(text2);

  return jw(text1, text2);
}

// Matching which considers word ordering insignificant.
// Citymarket Turtola is nearly perfect match with Turtolan Citymarket.
function fuzzyMatch(text1, text2) {
  text1 = normalize(text1);
  text2 = normalize(text2);

  // straight match as a whole string
  var score = _fuzzyMatch(text1, text2);
  if(score === 1) {
    return score;
  }

  // consider change of order e.g. Citymarket turtola | Turtolan citymarket
  // In normal text, change of order can be very significant. With addresses,
  // order does not matter that much.
  var words1 = text1.split(' ');
  var words2 = text2.split(' ');
  if(words1.length === 1 && words2.length === 1) {
    return score;
  }

  if(words1.length<5 && words2.length<5) { // must limit the length, long permutations are too slow
    var perm1;
    var perm2 = [];
    if (cachedPermutation.key === text1) {
      // search text permutation can be cached
      perm1 = cachedPermutation.result;
    } else {
      perm1 = [];
      // generate all possible orderings of word sequence
      heapPermutation(words1, words1.length, words1.length, perm1);
      cachedPermutation.key = text1;
      cachedPermutation.result = perm1;
    }
    heapPermutation(words2, words2.length, words2.length, perm2);

    perm1.forEach(function(p1) {
      perm2.forEach(function(p2) {
	var wscore = _fuzzyMatch(p1, p2);
	if (wscore>score) {
          score=wscore;
	}
      });
    });
  } else { // use simpler comparison for long sentences, complexity just O(n*m)
    if(words1.length>words2.length) {
      var temp = words1;
      words1 = words2;
      words2 = temp;
    }
    var wordScore=0;
    var weightSum=0;
    var matched={};
    words1.forEach(function(word1) {
      // find best matching yet unused word
      var bestScore=0, bestIndex;
      for(var wi in words2) {
	if (matched[wi]) {
	  continue;
	}
        var wscore = _fuzzyMatch(word1, words2[wi]);
        if (wscore>bestScore) {
          bestScore=wscore;
          bestIndex = wi;
        }
      }
      var l = word1.length;
      wordScore += l*bestScore; // weight by word len
      weightSum += l;
      matched[bestIndex]=true;
    });
    // extra words just accumulate weight, not score
    for (var wi2 in words2) {
      if (!matched[wi2]) {
        weightSum ++;
      }
    }
    wordScore /= weightSum;
    if(wordScore>score) {
      return wordScore;
    }
  }
  return score;
}

/* find best match from an array of values */
function fuzzyMatchArray(text, array) {
  var maxMatch = 0;
  array.forEach( function(text2) {
    var match = fuzzyMatch(text, text2);
    if (match>maxMatch) {
      maxMatch=match;
    }
  });
  return maxMatch;
}

module.exports = { match: fuzzyMatch, matchArray: fuzzyMatchArray };
