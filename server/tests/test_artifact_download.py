"""Tests for the artifact-download `Content-Disposition` header.

Guards against:

  1. The header silently disappearing (regression — would re-introduce
     the original bug where non-HTML artifacts had no way to leave the
     app).
  2. Header injection via adversarial filenames. The agent's shell
     tool can write artifact files with any byte the OS permits,
     including CR/LF on macOS/Linux. A naive `filename="{...}"` would
     let those bytes split headers; we sanitize CR/LF/quote/backslash
     in the ASCII fallback. The RFC 5987 `filename*=` half is
     percent-encoded and already safe.

Run with::

    python3 -m unittest server.tests.test_artifact_download -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


_THIS_DIR = Path(__file__).resolve().parent
_SERVER_DIR = _THIS_DIR.parent
if str(_SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(_SERVER_DIR))

from routes.artifacts import _attachment_disposition  # noqa: E402


class AttachmentDispositionTest(unittest.TestCase):
    """`_attachment_disposition()` builds a safe Content-Disposition value."""

    def test_plain_ascii_filename(self):
        out = _attachment_disposition("hello.csv")
        self.assertIn('filename="hello.csv"', out)
        self.assertIn("filename*=UTF-8''hello.csv", out)
        self.assertTrue(out.startswith("attachment; "))

    def test_filename_with_spaces(self):
        out = _attachment_disposition("my report.csv")
        # ASCII fallback keeps spaces (RFC 6266 allows them in
        # quoted-string); RFC 5987 percent-encodes them.
        self.assertIn('filename="my report.csv"', out)
        self.assertIn("filename*=UTF-8''my%20report.csv", out)

    def test_filename_with_unicode_uses_ascii_fallback_and_percent_encoded_star(self):
        # CJK + emoji in the same filename — exercise both code paths.
        out = _attachment_disposition("数据😀.csv")
        # ASCII fallback replaces non-ASCII bytes with "?" (then "?" is
        # ASCII so it passes through). filename* carries the UTF-8.
        self.assertIn('filename="', out)
        self.assertIn(".csv", out)
        # filename*= contains percent-encoded UTF-8 bytes — verify the
        # first byte sequence is present (E6 95 B0 is "数").
        self.assertIn("filename*=UTF-8''%E6%95%B0", out)

    def test_double_quote_in_filename_is_neutered_in_ascii_fallback(self):
        # Without sanitization, `filename="he said "hi".csv"` would
        # close the quoted string early, breaking the header.
        out = _attachment_disposition('he said "hi".csv')
        # Double-quote replaced with underscore in the ASCII half.
        self.assertNotIn('"hi"', out)
        self.assertIn('filename="he said _hi_.csv"', out)
        # filename*= percent-encodes the quote (%22), so it's safe there.
        self.assertIn("%22", out)

    def test_crlf_in_filename_cannot_inject_headers(self):
        # The attack: `\r\n` in the filename could let an attacker
        # split the response and inject new headers via
        # Content-Disposition. The defense is to drop literal CR/LF
        # bytes from the output entirely — the attacker's surrounding
        # text survives as part of the filename value, but inert,
        # because without CR/LF it can't escape the header line.
        out = _attachment_disposition("evil\r\nX-Injected: pwn.csv")
        self.assertNotIn("\r", out)
        self.assertNotIn("\n", out)
        # The ASCII fallback replaces CRLF with `_` (the attacker's
        # text after the CRLF survives as filename content, which is
        # harmless once split-by-newline is impossible).
        self.assertIn("evil__X-Injected: pwn.csv", out)
        # The percent-encoded RFC 5987 form carries the CRLF bytes as
        # `%0D%0A` — still inert, since percent-encoding doesn't
        # introduce real bytes into the header transport.
        self.assertIn("%0D%0AX-Injected", out)

    def test_backslash_is_neutered_in_ascii_fallback(self):
        # `\` is a quoted-string escape char per RFC 7230 — left
        # unescaped it can swallow the next char.
        out = _attachment_disposition('weird\\name.csv')
        # The ASCII filename= half should have it replaced.
        ascii_part = out.split("filename*=")[0]
        self.assertNotIn("\\", ascii_part)
        self.assertIn('filename="weird_name.csv"', out)


if __name__ == "__main__":
    unittest.main()
