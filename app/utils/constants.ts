// ═══ Colors, branding, and static constants ═══

export const C = {
  bg: "#06090f", s: "#0d1117", sL: "#151d2b",
  b: "#1b2436", bL: "#2a3a54",
  tx: "#f0f4fc", txM: "#a8b8d8", txD: "#7889a8",
  a: "#00e5ff", aD: "#007a8a", g: "#00e676", r: "#ff3d5a",
  o: "#ffab00", p: "#b388ff", pk: "#ff80ab", y: "#fdd835",
};

export const MASCOT = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAwADADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwC9Z2wVRxU8t5aWwZXmiMijPl7wGPtQ8Ya3bc8ioFJYIcEj0z1/KuI1KE210Y2CCTqyKMBc9vU49T1NeZb2sm2zsqVHBaI2p/E8xmHkQoiAdHO4mmWviBlup5ZcSB8Hyw2NrYwMVi2Vq9zKHKFot6hjg8D60/UbBEleSCN0iBwjZyM/XrWqoRbsZr2rXMddpOoPqSSF4o02HHytz+VLfWwZTxXG+HtWksb1GnyYiTHJjk49fwNd9LtePIIIIyCO9ZSjKjM1pT5lruGT5J2AFv4Qeme1edam0iyzsXMjtIwZz1J5yf0r0K3kyorD1fQ2ls5zBEC6zNMpHVgcZH4U6TUJWZNaDlawukiJNIs7do2Z5VO5hIF8o9vl6tmk1WW1W3+xiEiRIwTL5nV88rt9PeoPtGbWNLfYs8cY2S4GVA7dKzvNlfc1wQ8hP3j1FddKLcrs1krRtcyIv3d+6kY+bIwcZ5zXpccfkwCMMSq/dz1A7CuZtPD6X8Ynd2ibYw6fxZ+U/TFdG0hFuu/htoB+veufESU5WiZUouLZStZ8Ac1oxzAjrXPQS8Cri3OxCxPAFdOIw2tzcn1LTbWeGR4owlxtJVlOMn3rN0aPTXaJJixvFyWSUEDPoB0qzb6i7ruYYB5A9u1Vr25Wa5hyAXDZDDrxk1yQlP4Hc5HVfMdA8oArPuZsgjNRfafMjDA9RVWaXiuqhhrO51n/2Q==";

export const BET_COLORS = ["#b388ff", "#ff80ab", "#fdd835", "#4dd0e1", "#ff6e40"];

export const VAR_PERIODS = [
  { v: "1d" as const, l: "1 Day" },
  { v: "3d" as const, l: "3 Days" },
  { v: "7d" as const, l: "7 Days" },
  { v: "14d" as const, l: "14 Days" },
  { v: "30d" as const, l: "30 Days" },
];
