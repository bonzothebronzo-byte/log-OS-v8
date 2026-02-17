export const LETTER_DISTRIBUTION: Record<string, number> = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2,
  N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1,
  '*': 2
};

export const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
  '*': 0 
};

export const generateTileBag = (): string[] => {
  const bag: string[] = [];
  Object.entries(LETTER_DISTRIBUTION).forEach(([letter, count]) => {
    for (let i = 0; i < count; i++) {
      bag.push(letter);
    }
  });
  // Shuffle via Fisher-Yates
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
};

export const drawTiles = (currentHand: string[], tileBag: string[]) => {
  const needed = 7 - currentHand.length;
  if (needed <= 0 || tileBag.length === 0) {
    return { hand: currentHand, bag: tileBag };
  }
  
  const drawn = tileBag.slice(0, needed);
  const newBag = tileBag.slice(needed);
  const newHand = [...currentHand, ...drawn];
  
  return { hand: newHand, bag: newBag };
};