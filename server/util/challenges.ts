export type Challenge = {
  title: string;
  description: string;
};

export type LocalizedChallenge = {
  en: Challenge;
  it: Challenge;
};

export type SupportedLocale = 'en' | 'it';

export const localizedChallenges: LocalizedChallenge[] = [
  {
    en: {
      title: "Kitchen Counter Adventure",
      description: "Have sex in the kitchen (private home only). Try a position where one partner sits on the counter while the other stands."
    },
    it: {
      title: "Avventura sul Piano Cucina",
      description: "Fate sesso in cucina (solo a casa vostra). Provate una posizione dove un partner siede sul piano mentre l'altro sta in piedi."
    }
  },
  {
    en: {
      title: "Lights-Off, Music-On Night",
      description: "Choose a sensual playlist. Turn off the lights completely and let touch guide the session."
    },
    it: {
      title: "Notte con Luci Spente e Musica Accesa",
      description: "Scegliete una playlist sensuale. Spegnete completamente le luci e lasciate che il tatto guidi la sessione."
    }
  },
  {
    en: {
      title: "Mirror Play Challenge",
      description: "Have sex in a room with a visible mirror. Try positions like doggy style or cowgirl for added visual excitement."
    },
    it: {
      title: "Sfida allo Specchio",
      description: "Fate sesso in una stanza con uno specchio visibile. Provate posizioni come la pecorina o la cowgirl per un'eccitazione visiva aggiuntiva."
    }
  },
  {
    en: {
      title: "Blindfold & Touch",
      description: "She must be blindfolded and stand up. He has to slowly tease her with touches all over her body for a few minutes before sex, stimulating any part of the body he wants. She must stay still and not move until he decides."
    },
    it: {
      title: "Benda e Tocco",
      description: "Lei deve essere bendata e deve restare in piedi. Lui la deve stuzzicare lentamente con tocchi su tutto il corpo per qualche minuto prima del sesso, stimolando qualsiasi parte del corpo voglia. Lei deve restare ferma e non deve muoversi fino a quando non deciderà lui."
    }
  },
  {
    en: {
      title: "Laundry Room Lift",
      description: "Have sex in the laundry room. Try a standing position with one partner slightly lifted against the washer/dryer (only if safe and stable)."
    },
    it: {
      title: "Sollevamento in Lavanderia",
      description: "Fate sesso in lavanderia. Provate una posizione in piedi con un partner leggermente sollevato contro la lavatrice/asciugatrice (solo se sicuro e stabile)."
    }
  },
  {
    en: {
      title: "Bed Edge Session",
      description: "Have sex with the receiving partner lying on the edge of the bed while the other stands for a new angle and energy."
    },
    it: {
      title: "Sessione sul Bordo del Letto",
      description: "Fate sesso con il partner che riceve sdraiato sul bordo del letto mentre l'altro sta in piedi per un nuovo angolo ed energia."
    }
  },
  {
    en: {
      title: "Ice Cube Tease",
      description: "Use a small ice cube to tease lips, neck, or inner thighs for 30 seconds before sex."
    },
    it: {
      title: "Provocazione con Cubetto di Ghiaccio",
      description: "Usate un piccolo cubetto di ghiaccio per stuzzicare labbra, collo o interno cosce per 30 secondi prima del sesso."
    }
  },
  {
    en: {
      title: "Strip Tease Power Play Challenge",
      description: "One partner performs a striptease using a chair and one song. Clothing must come off slowly. Bonus: the other partner must not touch until the end."
    },
    it: {
      title: "Sfida dello Spogliarello",
      description: "Un partner esegue uno spogliarello usando una sedia e una canzone. I vestiti devono essere tolti lentamente. Bonus: l'altro partner non deve toccare fino alla fine."
    }
  },
  {
    en: {
      title: "Special movie together",
      description: "Watch an erotic movie together and recreate one of the scenes afterward."
    },
    it: {
      title: "Film Speciale Insieme",
      description: "Guardate un film erotico insieme e ricreate una delle scene dopo."
    }
  },
  {
    en: {
      title: "Alternative dinner",
      description: "Draw lots to see who will have to lie down naked or almost naked on the table or decide it on your own. The other partner will have to place food on the body of the first and eat it slowly without using hands. You can also eat things other than food 😏"
    },
    it: {
      title: "Cena Alternativa",
      description: "Tirate a sorte o decidete in autonomia chi dovrà distendersi nudo o quasi sul tavolo. L'altro partner dovrà adagiare del cibo sul corpo del primo e mangiarlo lentamente senza usare le mani. Si può mangiare anche altro oltre al cibo 😏"
    }
  },
  {
    en: {
      title: "Spicy cooking",
      description: "She has to cook dinner wearing only an apron or something very sexy. He will have to watch and endure her teasing without touching her until they finish dinner."
    },
    it: {
      title: "Cucina piccante",
      description: "Lei deve cucinare la cena indossando solo un grembiule o qualcosa di molto sexy. Lui dovrà stare a guardare e subire le sue provocazioni senza toccarla fino a quando non avranno finito di cenare."
    }
  },
  {
    en: {
      title: "Relaxing massage, or not",
      description: "She has to lie naked on the bed or sofa. He will have to massage her for at least 5 minutes without touching her intimate parts. After 5 minutes he can touch any part of the body, but the intimate parts only for a few seconds at a time. Then if the massage was good, she can decide whether to reward him."
    },
    it: {
      title: "Massaggio rilassante, oppure no",
      description: "Lei deve stendersi nuda sul letto o sul divano. Lui dovrà massaggiarla per almeno 5 minuti senza toccare le sue parti intime. Trascorsi i 5 può toccare qualsiasi parte del corpo, ma le parti intime solo per pochi secondi alla volta. Poi se il massaggio è piaciuto, lei può decidere se ricompensarlo."
    }
  },
  {
    en: {
      title: "Hot messaging",
      description: "Send each other sexy messages throughout the day to tease each other. You can describe what you will do later or remember spicy moments from the past. Try to combine detailed messages with suggestive ones. You can also send photos to increase the tension."
    },
    it: {
      title: "Messaggi bollenti",
      description: "Inviatevi messaggi sexy durante la giornata per stuzzicarvi a vicenda. Potete descrivere cosa farete più tardi o ricordare momenti piccanti del passato. Cercate di unire messaggi dettagliati e messaggi allusivi. Potete inviare anche foto per aumentare la tensione."
    }
  },
];

/**
 * Get a challenge in the specified locale
 */
export function getChallenge(index: number, locale: SupportedLocale = 'en'): Challenge {
  const localizedChallenge = localizedChallenges[index];
  return localizedChallenge[locale];
}

/**
 * Get all challenges in the specified locale
 */
export function getChallenges(locale: SupportedLocale = 'en'): Challenge[] {
  return localizedChallenges.map(c => c[locale]);
}

/**
 * Get the locale based on country code
 */
export function getLocaleFromCountry(country: string | null | undefined): SupportedLocale {
  if (country?.toUpperCase() === 'IT') {
    return 'it';
  }
  return 'en';
}

// Legacy export for backwards compatibility
export const challenges: Challenge[] = getChallenges('en');
