// 三叶草小宠物：颜文字风吉祥物（圆脸 + 豆豆眼 + ω 嘴）
// 每场会话随机一个姿态出场，陪用户跑完整场黑客松。

export interface PetArt {
  name: string;
  caption: string;
  lines: string[];
}

export const PETS: PetArt[] = [
  {
    name: "idle",
    caption: "Clover 在等你发号施令 🍀",
    lines: [
      "   /\\_/\\",
      "  ( ◕   ◕ )",
      "   > ω <",
      "   U   U",
    ],
  },
  {
    name: "happy",
    caption: "检查全过！今天也是幸运三叶草 ✨",
    lines: [
      "   /\\_/\\   *",
      "  ( ⌣   ⌣ )",
      "   > ω <",
      "   U   U",
    ],
  },
  {
    name: "sleepy",
    caption: "zZ… 别急，Clover 随时待命",
    lines: [
      "   /\\_/\\",
      "  ( ⌒   ⌒ )  z",
      "   > ω <",
      "   U   U",
    ],
  },
  {
    name: "busy",
    caption: "Clover 正在干活，稍等…",
    lines: [
      "   /\\_/\\",
      "  ( ◉   ◉ )",
      "   > ω <   %",
      "   U   U",
    ],
  },
  {
    name: "sad",
    caption: "啊哦，出了点小问题，再试一次？",
    lines: [
      "   /\\_/\\",
      "  ( ;   ; )",
      "   > ⌢ <",
      "   U   U",
    ],
  },
  {
    name: "think",
    caption: "Clover 正在思考…",
    lines: [
      "   /\\_/\\",
      "  ( o   o )  ?",
      "   > · <",
      "   U   U",
    ],
  },
];

export function randomPet(): PetArt {
  return PETS[Math.floor(Math.random() * PETS.length)] ?? PETS[0];
}

/** 开场白姿态：只从积极姿态里随机，避免开场就“出问题” */
export function randomWelcomePet(): PetArt {
  const welcome = ["idle", "happy", "sleepy", "think"];
  const name = welcome[Math.floor(Math.random() * welcome.length)] ?? "idle";
  return findPet(name) ?? PETS[0];
}

export function findPet(name: string): PetArt | undefined {
  return PETS.find((p) => p.name === name);
}

export function renderPet(pet: PetArt): string {
  return pet.lines.join("\n");
}
