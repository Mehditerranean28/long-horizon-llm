"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import StoryDialog from "./story-dialog";
import { stories } from "../../../app/customer-stories/stories";
import type { AppTranslations } from "@/lib/translations";
interface Props {
  t: AppTranslations;
}

export default function CustomerCarousel({ t }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const $menu = menuRef.current;
    if (!$menu) return;
    let $items = $menu.querySelectorAll<HTMLDivElement>(".menu--item");
    if ($items.length === 0) return;
    if ($items.length < 4) {
      const originals = Array.from($items);
      while ($menu.querySelectorAll(".menu--item").length < 4) {
        for (const item of originals) {
          $menu.appendChild(item.cloneNode(true));
          if ($menu.querySelectorAll(".menu--item").length >= 4) break;
        }
      }
      $items = $menu.querySelectorAll<HTMLDivElement>(".menu--item");
    }

    let itemWidth = ($items[0] as HTMLDivElement).clientWidth;
    let wrapWidth = $items.length * itemWidth;
    let scrollY = 0;
    let y = 0;
    const baseVelocity = window.innerWidth < 640 ? 0.3 : 0.5;
    let velocity = baseVelocity;
    let oldScrollY = 0;
    let scrollSpeed = 0;
    let frameId = 0;
    let isHovered = false;

    const lerp = (v0: number, v1: number, t: number) => v0 * (1 - t) + v1 * t;

    const dispose = (scroll: number) => {
      gsap.set($items, {
        x: (i) => i * itemWidth + scroll,
        modifiers: {
          x: (x) => {
            const s = gsap.utils.wrap(-itemWidth, wrapWidth - itemWidth, parseInt(x as string));
            return `${s}px`;
          },
        },
      });
    };
    dispose(0);

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.9;
      scrollY += delta;
      velocity = delta;
    };

    let pointerStart = 0;
    let pointerX = 0;
    let isDragging = false;
    const supportsHover = window.matchMedia("(hover: hover)").matches;

    const handlePointerDown = (e: PointerEvent) => {
      pointerStart = e.clientX;
      isDragging = true;
      isHovered = true;
      $menu.classList.add("is-dragging");
      $menu.setPointerCapture(e.pointerId);
    };
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      pointerX = e.clientX;
      const delta = (pointerX - pointerStart) * 2.5;
      scrollY += delta;
      velocity = delta;
      pointerStart = pointerX;
    };
    const handlePointerUp = (e?: PointerEvent) => {
      isDragging = false;
      isHovered = false;
      $menu.classList.remove("is-dragging");
      if (e) $menu.releasePointerCapture(e.pointerId);
    };

    const handleMouseEnter = () => {
      isHovered = true;
      velocity = 0;
    };
    const handleMouseLeave = () => {
      isHovered = false;
    };

    const onResize = () => {
      itemWidth = ($items[0] as HTMLDivElement).clientWidth;
      wrapWidth = $items.length * itemWidth;
    };

    $menu.style.touchAction = "none";
    $menu.addEventListener("wheel", handleWheel, { passive: false });
    $menu.addEventListener("pointerdown", handlePointerDown);
    $menu.addEventListener("pointermove", handlePointerMove);
    $menu.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointerup", handlePointerUp);
    $menu.addEventListener("pointercancel", handlePointerUp);
    $menu.addEventListener("mouseleave", handlePointerUp);
    if (supportsHover) {
      $menu.addEventListener("mouseenter", handleMouseEnter);
      $menu.addEventListener("mouseleave", handleMouseLeave);
    }
    $menu.addEventListener("selectstart", (e) => e.preventDefault());
    window.addEventListener("resize", onResize);

    const render = () => {
      if (!isDragging && !isHovered) {
        scrollY += velocity;
        // Gradually return to the base velocity for continuous motion
        velocity += (baseVelocity - velocity) * 0.05;
      }
      y = lerp(y, scrollY, 0.1);
      dispose(y);
      scrollSpeed = y - oldScrollY;
      oldScrollY = y;
      gsap.to($items, {
        duration: 0.2,
        ease: "power1.out",
        skewX: -scrollSpeed * 0.2,
        rotate: scrollSpeed * 0.01,
        scale: 1 - Math.min(100, Math.abs(scrollSpeed)) * 0.003,
      });
      frameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(frameId);
      $menu.removeEventListener("wheel", handleWheel);
      $menu.removeEventListener("pointerdown", handlePointerDown);
      $menu.removeEventListener("pointermove", handlePointerMove);
      $menu.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointerup", handlePointerUp);
      $menu.removeEventListener("pointercancel", handlePointerUp);
      $menu.removeEventListener("mouseleave", handlePointerUp);
      if (supportsHover) {
        $menu.removeEventListener("mouseenter", handleMouseEnter);
        $menu.removeEventListener("mouseleave", handleMouseLeave);
      }
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div
      ref={menuRef}
      className="menu flex overflow-hidden cursor-grab py-4 select-none gap-1"
    >
      {stories(t).map((story) => (
        <div key={story.slug} className="menu--item px-2">
          <StoryDialog story={story} t={t}>
            <div className="w-72 bg-white text-gray-900 shadow-md rounded-xl p-6 hover:bg-primary hover:text-primary-foreground transition-colors">
              <h3 className="font-semibold text-base mb-1 text-gray-900">
                {story.title}
              </h3>
              <p className="text-sm text-muted-foreground">{story.service}</p>
            </div>
          </StoryDialog>
        </div>
      ))}
    </div>
  );
}
