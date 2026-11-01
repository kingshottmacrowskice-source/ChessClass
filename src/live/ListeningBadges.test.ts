import { createElement } from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ListeningBadges from "./ListeningBadges";
describe("skill visibility", () => {
  it("only exposes the viewing side's learned skills and cooldowns", () => {
    const skills: [string, {color: "w" | "b"; cooldown: number}][] = [["e2", {color:"w",cooldown:0}], ["e7", {color:"b",cooldown:6}]];
    for (const viewerColor of ["w", "b"] as const) {
      const html = renderToStaticMarkup(createElement(ListeningBadges, {skills, viewerColor, project: () => ({x:100,y:100,width:100})}));
      expect(html).toContain(viewerColor === "w" ? "e2 听桥" : "e7 听桥");
      expect(html).not.toContain(viewerColor === "w" ? "e7 听桥" : "e2 听桥");
      expect(html).toContain("width:24px");
    }
  });
});
