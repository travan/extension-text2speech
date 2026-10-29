import { useEffect, useRef } from "react";

interface ReadingTextProps {
  text: string;
  active: boolean;
  range: { start: number; end: number } | null;
  className: string;
}

export function ReadingText({ text, active, range, className }: ReadingTextProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (active) {
      (ref.current?.querySelector("mark") ?? ref.current)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [active, range?.start]);

  return (
    <p ref={ref} className={`${className}${active ? " reading-text" : ""}`}>
      {active && range ? <>
        {text.slice(0, range.start)}
        <mark>{text.slice(range.start, range.end)}</mark>
        {text.slice(range.end)}
      </> : text}
    </p>
  );
}
