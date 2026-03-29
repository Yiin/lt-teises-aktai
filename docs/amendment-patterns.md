# Lithuanian Amendment Act Patterns

Reference documentation for building a parser that processes Lithuanian legal amendment acts (pakeitimo istatymai) from e-TAR. Based on analysis of 12+ real amendment acts published in 2023-2025.

---

## 1. Overall Structure of an Amendment Act

Every amendment act follows the same template:

```
[Coat of arms image]
LIETUVOS RESPUBLIKOS
{PARENT LAW NAME} NR. {DOK_NR} {TARGET DESCRIPTION}
ISTATYMAS

{YYYY} m. {month} {DD} d. Nr. {DOK_NR}
Vilnius

{Article 1: first change}
{Article 2: second change}
...
{Article N: final provisions / isigaliojimas}

Skelbiu si Lietuvos Respublikos Seimo priimta istatyma.

Respublikos Prezidentas                    {Name}
```

### Key structural facts

- The amendment act is itself a law (istatymas) with its own articles (straipsniai).
- Each article of the amendment act describes ONE amendment operation on the parent law.
- The final article is typically "Istatymo isigaliojimas" or "Istatymo isigaliojimas ir igyvendinimas" (entry into force / transitional provisions).
- The act ends with the president's promulgation formula: *Skelbiu si Lietuvos Respublikos Seimo priimta istatyma.*

---

## 2. How Amendment Acts Reference the Parent Law

### In the title (centered, uppercase)

```
LIETUVOS RESPUBLIKOS
{LAW NAME} NR. {DOK_NR} {ARTICLE NUMBERS} STRAIPSNIU PAKEITIMO
ISTATYMAS
```

The title encodes:
- The parent law's full name
- The parent law's document number (e.g., `Nr. IX-2160`, `Nr. XI-1375`)
- What is being changed (article numbers, chapter names, annex)
- The type of changes (pakeitimo = amendment, papildymo = supplement, pripazinimo netekusiu galios = repeal)

### Title pattern variants

| Pattern | Meaning |
|---|---|
| `{law} Nr. {nr} X straipsnio pakeitimo istatymas` | Amend single article |
| `{law} Nr. {nr} X, Y ir Z straipsniu pakeitimo istatymas` | Amend multiple articles |
| `{law} Nr. {nr} X straipsnio pakeitimo ir Istatymo papildymo Y straipsniu istatymas` | Amend + supplement |
| `{law} Nr. {nr} X straipsniu pakeitimo ir Y straipsniu pripazinimo netekusiais galios istatymas` | Amend + repeal |
| `{law} Nr. {nr} X skyriaus pakeitimo istatymas` | Amend entire chapter |
| `{law} Nr. {nr} priedo pakeitimo istatymas` | Amend annex |
| `{law} Nr. {nr} X skyriaus pavadinimo pakeitimo istatymas` | Change chapter title |

### In the article headings

Each article heading follows this pattern:

```
{N} straipsnis. {target description}
```

Examples:
- `1 straipsnis. 2 straipsnio pakeitimas` (Amendment of article 2)
- `2 straipsnis. 91 straipsnio pripazinimas netekusiu galios` (Repeal of article 91)
- `3 straipsnis. Istatymo papildymas 131 straipsniu` (Supplementing the law with article 13-1)
- `4 straipsnis. VI skyriaus antrojo skirsnio pavadinimo pakeitimas` (Changing title of Chapter VI, Section 2)
- `5 straipsnis. Istatymo isigaliojimas ir taikymas` (Entry into force and application)

---

## 3. Amendment Operation Patterns

### 3.1 Replace an entire article

**Lithuanian pattern:**
```
Pakeisti {N} straipsni ir ji isdestyti taip:
"{N} straipsnis. {title}
{body...}"
```

**Regex:**
```
Pakeisti\s+(\d+(?:\s*\d+)?)\s+straipsn[iy]\s+ir\s+j[iy]\s+i[sš]d[eė]styti\s+taip\s*:
```

**Characteristics:**
- The instruction line ends with a colon `:`
- The replacement text starts on the next paragraph, delimited by `„` (U+201E, opening) and `"` (U+201C, closing)
- The opening `„` immediately precedes the article number
- The closing `"` appears after the final text of the replacement, possibly followed by a period
- The replacement text includes the full article: number, title, and body with all paragraphs

**Real examples from HTML:**
```
Pakeisti 112 straipsni ir ji isdestyti taip:
„112 straipsnis. Nesiiemimas priemoniu...
1. ...
2. ..."
```

**HTML structure:**
```html
<p>Pakeisti 112 straipsnį ir jį išdėstyti taip:</p>
<div id="part_...">  <!-- replacement content wrapper -->
  <div id="part_...">  <!-- article wrapper -->
    <p>„<b>112 straipsnis. Title</b></p>
    <div id="part_...">  <!-- paragraph 1 -->
      <p>1. Text...</p>
    </div>
    <div id="part_...">  <!-- paragraph 2 -->
      <p>2. Text..."</p>  <!-- closing quote on last paragraph -->
    </div>
  </div>
</div>
```

### 3.2 Replace a specific paragraph (dalis) of an article

**Lithuanian pattern:**
```
Pakeisti {N} straipsnio {M} dali ir ja isdestyti taip:
"{M}. {text...}"
```

**Regex:**
```
Pakeisti\s+(\d+(?:\s*\d+)?)\s+straipsnio\s+(\d+)\s+dal[iy]\s+ir\s+j[aą]\s+i[sš]d[eė]styti\s+taip\s*:
```

**Characteristics:**
- Same quoting convention as full article replacement
- The replacement text contains only the paragraph, starting with its number and period
- When multiple paragraphs of the same article are changed, each gets a numbered sub-point within the amendment article

**Real example:**
```
1. Pakeisti 351 straipsnio 5 dali ir ja isdestyti taip:
„5. Naujo neypatingojo statinio savaliska statyba
uztraukia bauda..."

2. Pakeisti 351 straipsnio 7 dali ir ja isdestyti taip:
„7. Naujo neypatingojo statinio..."
```

### 3.3 Replace a specific point (punktas) of a paragraph

**Lithuanian pattern:**
```
Pakeisti {N} straipsnio {M} dalies {K} punkta ir ji isdestyti taip:
"{K}) {text...}"
```

**Regex:**
```
Pakeisti\s+(\d+(?:\s*\d+)?)\s+straipsnio\s+(\d+)\s+dalies\s+(\d+)\s+punkt[aą]\s+ir\s+j[iy]\s+i[sš]d[eė]styti\s+taip\s*:
```

**Real example:**
```
Pakeisti 589 straipsnio 31 punkta ir ji isdestyti taip:
„31) aplinkos apsaugos valstybines kontroles pareigūnai – del..."
```

**Note:** Points use `)` after the number, not `.` (which is used for dalys/paragraphs).

### 3.4 Replace a specific numbered item within a punktas

**Lithuanian pattern:**
```
Pakeisti {N} straipsnio {M} dalies {K} punkto {L} papunkti ir ji isdestyti taip:
```

**Regex:**
```
Pakeisti\s+.+\s+punkt[ao]\s+(\w+)\s+papunkt[iy]\s+ir\s+j[iy]\s+i[sš]d[eė]styti\s+taip\s*:
```

Sub-points (papunkciai) use letters: `a)`, `b)`, `c)`.

### 3.5 Supplement an article with a new paragraph

**Lithuanian pattern:**
```
Papildyti {N} straipsni {M} dalimi:
"{M}. {text...}"
```

Or adding at a specific position:
```
Papildyti {N} straipsnio {M} dali nauju {K} punktu:
"{K}) {text...}"
```

**Regex:**
```
Papildyti\s+(\d+(?:\s*\d+)?)\s+straipsn[iy]\s+(\d+)\s+dalimi\s*:
```

```
Papildyti\s+(\d+(?:\s*\d+)?)\s+straipsnio\s+(\d+)\s+dal[iy]\s+nauju\s+(\d+)\s+punktu\s*:
```

**Real example:**
```
1. Papildyti 3 straipsnio 2 dali nauju 11 punktu:
„11) Lietuvos Respublikoje igyvendinamu tarptautiniu sankciju..."
```

### 3.6 Supplement a law with a new article

**Lithuanian pattern:**
```
Papildyti Istatyma {N} straipsniu:
"{N} straipsnis. {title}
{body...}"
```

**Regex:**
```
Papildyti\s+[IĮ]statym[aą]\s+(\d+(?:\s*\d+)?)\s+straipsniu\s*:
```

**Real example:**
```
Papildyti Istatyma 131 straipsniu:
„131 straipsnis. Tarptautiniu sankciju pazeidimas
Tarptautiniu sankciju pazeidimas yra:
1) tiesioginis ar netiesioginis..."
```

**Note:** Superscript numbers in HTML represent the dash-numbering convention. `13<sup>1</sup>` in HTML = `13-1` or `13^1` in text. This refers to article 13-1 (inserted after article 13).

### 3.7 Supplement a law with new articles (plural)

**Lithuanian pattern:**
```
Papildyti Istatyma {N1}, {N2} straipsniais:
```

Or separate articles of the amendment act for each new article:
```
2 straipsnis. Istatymo papildymas 151 straipsniu
Papildyti Istatyma 151 straipsniu:
„151 straipsnis. ..."

3 straipsnis. Istatymo papildymas 152 straipsniu
Papildyti Istatyma 152 straipsniu:
„152 straipsnis. ..."
```

### 3.8 Supplement a law with a new chapter/section

**Lithuanian pattern:**
```
Papildyti Istatyma {Roman}{sup} skyriumi:
„{Roman}{sup} SKYRIUS
{CHAPTER TITLE}
{articles...}"
```

**Regex:**
```
Papildyti\s+[IĮ]statym[aą]\s+([\w\s]+)\s+skyriumi\s*:
```

**Real example:**
```
Papildyti Istatyma II1 skyriumi:
„II1 SKYRIUS
RIBOJAMUUJU PRIEMONIU NUSTATYMAS IR IGYVENDINIMAS
61 straipsnis. ..."
```

### 3.9 Supplement a law with an annex

**Lithuanian pattern:**
```
Papildyti Istatyma priedu:
„Lietuvos Respublikos {law name} priedas
IGYVENDINAMI EUROPOS SAJUNGOS TEISES AKTAI
1. {EU directive reference}
2. {EU directive reference}..."
```

**Regex:**
```
Papildyti\s+[IĮ]statym[aą]\s+priedu\s*:
```

### 3.10 Supplement an annex with a new item

**Lithuanian pattern:**
```
Papildyti {Kodekso|Istatymo} prieda {N} punktu:
"{N}. {text...}"
```

**Regex:**
```
Papildyti\s+(?:Kodekso|[IĮ]statymo)\s+pried[aą]\s+(\d+)\s+punktu\s*:
```

**Real example:**
```
Papildyti Kodekso prieda 122 punktu:
„122. 2024 m. balandzio 24 d. Europos Parlamento ir Tarybos direktyva..."
```

### 3.11 Replace an annex entirely

**Lithuanian pattern:**
```
Pakeisti Istatymo prieda ir ji isdestyti taip:
„Lietuvos Respublikos {law name} priedas
{HEADING}
1. ...
2. ...
____________________".
```

**Regex:**
```
Pakeisti\s+[IĮ]statymo\s+pried[aą]\s+ir\s+j[iy]\s+i[sš]d[eė]styti\s+taip\s*:
```

**Note:** The `____________________"` (underscores followed by closing quote + period) marks the end of the annex replacement. This is a standard delimiter used after annex content.

### 3.12 Repeal an article

**Lithuanian pattern (singular):**
```
Pripazinti netekusiu galios {N} straipsni.
```

**Lithuanian pattern (plural):**
```
Pripazinti netekusiais galios {N} ir {M} straipsnius.
```

**Regex (singular):**
```
Pripažinti\s+netekusiu\s+galios\s+(\d+(?:\s*\d+)?)\s+straipsn[iy]\.
```

**Regex (plural):**
```
Pripažinti\s+netekusiais\s+galios\s+([\d,\s]+(?:ir\s+\d+)?)\s+straipsnius\.
```

**Characteristics:**
- No replacement text follows -- this is a standalone sentence ending with a period
- The article heading uses `pripazinimas netekusiu galios` (singular) or `pripazinimas netekusiais galios` (plural)

**Real examples:**
```
2 straipsnis. 91 straipsnio pripazinimas netekusiu galios
Pripazinti netekusiu galios 91 straipsni.

4 straipsnis. 93 ir 94 straipsniu pripazinimas netekusiais galios
Pripazinti netekusiais galios 93 ir 94 straipsnius.
```

### 3.13 Supplement an article with new paragraphs (with renumbering)

**Lithuanian pattern:**
```
1. Papildyti {N} straipsni naujomis {M} ir {K} dalimis:
"{M}. {text...}
{K}. {text...}"
2. Buvusias {N} straipsnio {old range} dalis laikyti atitinkamai {new range} dalimis.
```

**Regex for renumbering:**
```
Buvusi[aąo]s?\s+(\d+)\s+straipsnio\s+([\d–-]+)\s+dali[sų]\s+laikyti\s+atitinkamai\s+([\d–-]+)\s+dalimis\.
```

**Real example:**
```
1. Papildyti 2 straipsni naujomis 1 ir 2 dalimis:
„1. Ekonominiu istekliu isaldymas – ..."
2. Buvusias 2 straipsnio 1-3 dalis laikyti atitinkamai 3-5 dalimis.
```

**Similarly for points:**
```
Buvusi {N} straipsnio {M} dalies {K} punkta laikyti {L} punktu.
```

### 3.14 Change a chapter/section title

**Lithuanian pattern:**
```
Pakeisti {Roman} skyriaus {ordinal} skirsnio pavadinima ir ji isdestyti taip:
"{SECTION NAME}
{SECTION TITLE}".
```

**Regex:**
```
Pakeisti\s+(.+?)\s+pavadinim[aą]\s+ir\s+j[iy]\s+i[sš]d[eė]styti\s+taip\s*:
```

**Real example:**
```
Pakeisti VI skyriaus antrojo skirsnio pavadinima ir ji isdestyti taip:
„ANTRASIS SKIRSNIS
MELIORUOTOJE ZEMEJE TAIKOMOS SPECIALIOSIOS ZEMES NAUDOJIMO SALYGOS".
```

### 3.15 Replace an entire chapter/section

**Lithuanian pattern:**
```
Pakeisti {target} ir ji isdestyti taip:
"{SECTION/CHAPTER NAME}
{TITLE}
{articles...}"
```

**Real example:**
```
Pakeisti V skyrių ir jį išdėstyti taip:
„V SKYRIUS
ATSAKOMYBE UZ TARPTAUTINIU SANKCIJU PAZEIDIMUS
13 straipsnis. ...
14 straipsnis. ..."
```

```
Pakeisti X skyriaus antraji skirsni ir ji isdestyti taip:
„ANTRASIS SKIRSNIS
{TITLE}
135 straipsnis. ..."
```

### 3.16 Supplement an article with new paragraphs at the beginning

**Lithuanian pattern:**
```
Papildyti {N} straipsni naujomis {M} ir {K} dalimis:
```

When inserting at the beginning (e.g., new parts 1 and 2), existing parts get renumbered in a separate sub-point of the same amendment article.

---

## 4. Quote Delimiter Rules

### Unicode characters

| Character | Unicode | Name | Usage |
|---|---|---|---|
| `„` | U+201E | Double low-9 quotation mark | Opens replacement text |
| `"` | U+201C | Left double quotation mark | Closes replacement text |

### Placement rules

1. **Opening quote `„`** appears at the start of the first `<span>` or text node in the replacement div, immediately before the first character of the replacement content (article number, paragraph number, etc.)

2. **Closing quote `"`** appears at the end of the last text in the replacement:
   - For article replacements: after the period of the last sentence of the last paragraph
   - For punkt replacements: after the semicolon `;` typically, followed by `".` (close quote + period outside)
   - For annex replacements: on a separate line as `____________________".` (underscores + close quote + period)

3. **Close-quote + period `".`** is used when the replacement is embedded in a list context (e.g., adding an item to an annex's numbered list). The period belongs to the amendment sentence, not the replacement text.

4. **Close-quote alone `"`** is used when the replacement is a complete structural unit (whole article, whole paragraph).

### Nesting

Replacement text never contains nested Lithuanian quotes. If the replacement text itself needs quotes, regular `"` (U+0022) ASCII quotes or other punctuation is used within.

---

## 5. HTML Structure Patterns

### Document skeleton

```html
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="Generator" content="Microsoft Word 15 (filtered)">
  <style><!-- MsoNormal styles --></style>
</head>
<body lang="EN-US">
  <div class="WordSection1">
    <div id="part_{uuid}">           <!-- root document part -->
      <!-- title block (centered paragraphs) -->
      <!-- articles as nested divs -->
      <!-- promulgation formula -->
    </div>
  </div>
</body>
</html>
```

### Part hierarchy

Every structural element is wrapped in a `<div id="part_{uuid}">` with a corresponding anchor `<a name="part_{uuid}">`. The nesting follows the logical structure:

```
div.part (root)
  div.part (article 1)
    div.part (sub-point 1 of article)
      div.part (replacement text wrapper)
        div.part (replacement article)
          div.part (paragraph 1)
          div.part (paragraph 2)
    div.part (sub-point 2)
  div.part (article 2)
    ...
```

### Title block

The title is spread across multiple centered `<p>` elements:

```html
<p align="center"><b><span style="text-transform:uppercase">LIETUVOS RESPUBLIKOS</span></b></p>
<p align="center"><b><span style="text-transform:uppercase">{LAW TITLE CONTINUATION}</span></b></p>
<p align="center"><b><span style="text-transform:uppercase">ISTATYMAS</span></b></p>
<p align="center">{YYYY}<span lang="LT"> m. </span>{month} {DD}<span lang="LT"> d. Nr. </span>{DOK_NR}</p>
<p align="center"><span lang="LT">Vilnius</span></p>
```

### Article headings

Article headings use bold text within paragraphs:

```html
<p style="text-align:justify;text-indent:.5in;line-height:150%">
  <b><span lang="LT">{N}</span></b>
  <b><span lang="LT"> straipsnis. </span></b>
  <b><span lang="LT">{title}</span></b>
</p>
```

The number and "straipsnis." text may be in separate `<span>` elements but are always within the same `<p>` and always bold.

### Amendment instruction text

The instruction (e.g., "Pakeisti 112 straipsni ir ji isdestyti taip:") is a non-bold `<p>` within the article's div:

```html
<p style="text-align:justify;text-indent:.5in;line-height:150%">
  <span lang="LT">Pakeisti 112 straipsnį ir jį išdėstyti taip:</span>
</p>
```

### Superscript article numbers

Article numbers like 13-1, 113-1, 15-2 are rendered with superscript in HTML:

```html
113<sup>1</sup>   <!-- = 113-1 or 113^1 -->
15<sup>2</sup>    <!-- = 15-2 or 15^2 -->
```

This is critical for parsing -- the superscript must be detected and converted to a dash notation.

### Replacement text block

Replacement content is nested inside divs, with the opening `„` quote at the start and closing `"` at the end:

```html
<div id="part_...">     <!-- replacement wrapper -->
  <div id="part_...">   <!-- article content -->
    <p>„<b>112 straipsnis. Title</b></p>
    <div id="part_...">
      <p>1. First paragraph text</p>
    </div>
    <div id="part_...">
      <p>2. Last paragraph text."</p>  <!-- closing quote -->
    </div>
  </div>
</div>
```

---

## 6. Amendment Act Article Structure

### Single operation per amendment article

When an article in the amendment act contains one operation:

```
{N} straipsnis. {target} pakeitimas
{operation instruction}
{replacement text}
```

### Multiple operations per amendment article

When one article of the amendment act makes multiple changes to the same target article:

```
{N} straipsnis. {target} pakeitimas
1. {first operation}
{replacement text 1}
2. {second operation}
{replacement text 2}
3. {third operation}
{replacement text 3}
```

Real example from ANK 351 straipsnio pakeitimas:
```
4 straipsnis. 351 straipsnio pakeitimas
1. Pakeisti 351 straipsnio 5 dali ir ja isdestyti taip:
„5. ..."
2. Pakeisti 351 straipsnio 7 dali ir ja isdestyti taip:
„7. ..."
3. Pakeisti 351 straipsnio 9 dali ir ja isdestyti taip:
„9. ..."
```

Another example combining supplement + renumbering:
```
1 straipsnis. 2 straipsnio pakeitimas
1. Papildyti 2 straipsni naujomis 1 ir 2 dalimis:
„1. ...
2. ..."
2. Buvusias 2 straipsnio 1-3 dalis laikyti atitinkamai 3-5 dalimis.
```

### Combined pakeitimo + papildymo in one amendment act

The title lists all operations and the affected targets. Each gets its own article:

```
Title: ... 5 straipsnio pakeitimo ir Istatymo papildymo 15-1, 15-2 straipsniais ir priedu istatymas

1 straipsnis. 5 straipsnio pakeitimas       -- pakeisti
2 straipsnis. Istatymo papildymas 15^1 straipsniu  -- papildyti
3 straipsnis. Istatymo papildymas 15^2 straipsniu  -- papildyti
4 straipsnis. Istatymo papildymas priedu     -- papildyti
5 straipsnis. Istatymo isigaliojimas         -- final provisions
```

---

## 7. Final Provisions Article

The last article (or last few articles) contain entry-into-force and transitional provisions. Common patterns:

### Simple entry into force

```
{N} straipsnis. Istatymo isigaliojimas
Sis istatymas isigalioja {YYYY} m. {month} {DD} d.
```

### Deferred entry into force with implementing regulations

```
{N} straipsnis. Istatymo isigaliojimas ir igyvendinimas
1. Sis istatymas, isskyrus sio straipsnio 2 dali, isigalioja {date}.
2. {Ministry} iki {date} priima sio istatymo igyvendinamuosius teises aktus.
```

### Transitional provisions

```
{N} straipsnis. Istatymo isigaliojimas ir taikymas
1. Sis istatymas isigalioja {date}.
2. {Institution} iki {date} pagal {old law articles} pradestas ir nebaigtas {process} baigiamas nagrineti iki {date} galiojusia tvarka.
```

---

## 8. Complete Operation Taxonomy

| # | Operation | Lithuanian pattern | Target levels | Has replacement text |
|---|---|---|---|---|
| 1 | Replace article | `Pakeisti X straipsni ir ji isdestyti taip:` | straipsnis | Yes |
| 2 | Replace paragraph | `Pakeisti X str. Y dali ir ja isdestyti taip:` | dalis | Yes |
| 3 | Replace point | `Pakeisti X str. Y dalies Z punkta ir ji isdestyti taip:` | punktas | Yes |
| 4 | Replace sub-point | `Pakeisti ... Z punkto W papunkti ir ji isdestyti taip:` | papunktis | Yes |
| 5 | Replace chapter | `Pakeisti V skyriu ir ji isdestyti taip:` | skyrius | Yes |
| 6 | Replace section | `Pakeisti X skyriaus Y skirsni ir ji isdestyti taip:` | skirsnis | Yes |
| 7 | Replace annex | `Pakeisti Istatymo prieda ir ji isdestyti taip:` | priedas | Yes |
| 8 | Replace title/name | `Pakeisti X skyriaus Y skirsnio pavadinima ir ji isdestyti taip:` | pavadinimas | Yes |
| 9 | Add paragraph | `Papildyti X straipsni Y dalimi:` | dalis | Yes |
| 10 | Add point | `Papildyti X str. Y dali nauju Z punktu:` | punktas | Yes |
| 11 | Add article | `Papildyti Istatyma X straipsniu:` | straipsnis | Yes |
| 12 | Add chapter | `Papildyti Istatyma X skyriumi:` | skyrius | Yes |
| 13 | Add section | `Papildyti Istatyma X skirsniu:` | skirsnis | Yes |
| 14 | Add annex | `Papildyti Istatyma priedu:` | priedas | Yes |
| 15 | Add annex item | `Papildyti Istatymo prieda X punktu:` | punktas | Yes |
| 16 | Add multiple paragraphs | `Papildyti X str. naujomis Y ir Z dalimis:` | dalys | Yes |
| 17 | Repeal article (sg.) | `Pripazinti netekusiu galios X straipsni.` | straipsnis | No |
| 18 | Repeal articles (pl.) | `Pripazinti netekusiais galios X ir Y straipsnius.` | straipsniai | No |
| 19 | Renumber paragraphs | `Buvusias X str. Y-Z dalis laikyti atitinkamai W-V dalimis.` | dalys | No |
| 20 | Renumber points | `Buvusi X str. Y dalies Z punkta laikyti W punktu.` | punktas | No |

---

## 9. Frequency Analysis (from index of ~22,000 acts)

| Pattern | Count in index |
|---|---|
| `pakeitimo` in title | 11,934 |
| `papildymo` in title | 3,758 |
| `pripazinimo netekusiu galios` in title | 794 |
| `priedo` in title | 932 |
| `skirsnio pakeitimo` in title | 270 |
| `pavadinimo pakeitimo` in title | 187 |
| `skyriaus pakeitimo` in title | 175 |

---

## 10. Edge Cases and Special Patterns

### 1. Kodeksas vs. Istatymas terminology

For codes (kodeksai), the document is referred to as "Kodeksas" rather than "Istatymas":
- `Papildyti Kodeksa 207-2 straipsniu:` (not "Papildyti Istatyma")
- `Papildyti Kodekso prieda 122 punktu:` (not "Istatymo prieda")

### 2. Superscript numbering for inserted articles

Articles inserted between existing ones use superscript: `13^1` (between 13 and 14), `15^2` (second insertion after 15). In HTML this is `<sup>1</sup>`.

### 3. Multiple comma-separated targets

Amendment titles may list many articles:
```
ADMINISTRACINIU NUSIZENGIMU KODEKSO 112, 113, 113^1, 351 IR 589 STRAIPSNIU PAKEITIMO ISTATYMAS
```

### 4. Mixed operations in one amendment act

A single amendment act can contain multiple operation types:
- pakeitimo (replacement) + papildymo (supplement) + pripazinimo netekusiais galios (repeal)
- All in separate articles of the amendment act

### 5. Annex closing with underscores

When replacing an entire annex, the closing is:
```
____________________".
```
This horizontal rule of underscores + closing quote + period is a standard delimiter.

### 6. Cross-references within replacement text

Replacement text may reference other articles of the same law (e.g., "sio istatymo 99 straipsnio 12 punkto c papunktyje") and EU directives (rendered as hyperlinks in HTML with `eur-lex.europa.eu` URLs).

### 7. Background highlighting in HTML

Some text within amendments has `style="background:white"` which is used for editorial emphasis but has no semantic meaning for parsing.

### 8. Promulgation formula always italic

```html
<p><i><span lang="LT">Skelbiu si Lietuvos Respublikos Seimo priimta istatyma.</span></i></p>
```

### 9. Article numbering across amendment acts

The articles of the amendment act itself are numbered 1, 2, 3... sequentially. These are NOT the same as the article numbers in the parent law. Article 1 of the amendment might modify article 589 of the parent law.

### 10. "bei" as conjunction

In titles, "bei" (and/as well as) connects different targets:
```
2 IR 13 STRAIPSNIU BEI PRIEDO PAKEITIMO
```
This means articles 2, 13, and the annex are all being amended.

### 11. Gender agreement in instruction verbs

The instruction text uses different grammatical forms depending on the target:
- `straipsni... ji` (masculine: article)
- `dali... ja` (feminine: paragraph/part)
- `punkta... ji` (masculine: point)
- `prieda... ji` (masculine: annex)
- `skirsni... ji` (masculine: section)
- `pavadinima... ji` (masculine: title/name)

### 12. Amendment of amendment acts

Sometimes an amendment modifies another amendment act (not the original law):
```
Lietuvos Respublikos socialiniu paslaugu istatymo Nr. X-493 pakeitimo istatymo Nr. XIV-2357 6 straipsnio pakeitimo istatymas
```
This amends article 6 of amendment law XIV-2357, which itself amended the Social Services Law X-493.
