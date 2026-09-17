export default function manifest() {
  return {
    name: "TaskFlow — Collaborative Project Management",
    short_name: "TaskFlow",
    description: "Organize work into boards, lists, and cards with real-time updates.",
    start_url: "/workspace",
    display: "standalone",
    background_color: "#F5F6F8",
    theme_color: "#3457D5",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
