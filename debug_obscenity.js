import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  transformers: englishRecommendedTransformers,
});

const testWords = ['nigger', 'n1gger', 'NIGGER', 'faggot', 'fuck'];
testWords.forEach((word) => {
  const matches = matcher.getAllMatches(word);
  console.log(`Word: "${word}", Matches: ${matches.length}`);
  matches.forEach((m) => {
    console.log(
      `  - Match: "${word.slice(m.range[0], m.range[1] + 1)}", Term: "${m.term.originalWord}"`,
    );
  });
});
