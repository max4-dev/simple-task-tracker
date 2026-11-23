export const BRANDING = {
  NAME: "Task tracker",
  get DESCRIPTION(): string {
    return this.INTRO.join(" ");
  },
  TAGLINE: ["Меньше шума.", "Больше сделанного."],
  INTRO: ["Задачи, проекты и команда.", "В одном пространстве."],
  FOOTER: "Всё начинается с одной задачи.",
} as const;
