import { readingParagraphs } from "../lib/reading-paragraphs";
export default function ReadableText({ text }: { text: string }) {
  return (
    <div className="readable-text">
      {readingParagraphs(text).map(({ text, emphasis }, i) => (
        <p key={i}>
          {emphasis ? (
            <>
              <strong>{emphasis}</strong>
              {text.slice(emphasis.length)}
            </>
          ) : (
            text
          )}
        </p>
      ))}
    </div>
  );
}
