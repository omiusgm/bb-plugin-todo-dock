# Изображения и уведомления о правах

MIT в LICENSE распространяется на код Todo Dock, а не на изображения питомцев.
Питомцы Codex (`codex`, `hoots`, `rocky`, `seedy`, `fireball`, `stacky`, `dewey`)
— рисунки OpenAI из приложения Codex. Clawd и крабы — неофициальные фанатские
изображения маскота Claude Code.

«Claude», «Clawd», «Codex», «OpenAI», «Anthropic» — товарные знаки их владельцев.
Проект неофициальный, не связан с OpenAI и Anthropic. Этот репозиторий
не предоставляет прав на чужие изображения, персонажей и товарные знаки.
По просьбе правообладателей изображения будут убраны. Обращения:
[Issues](https://github.com/omiusgm/bb-plugin-todo-dock/issues).

Ниже сохранён исходный документ о происхождении Clawd и уведомления источников.
Описанный скрипт отрисовки и материалы проверки не входят в этот пакет.

---

# Clawd для Todo Dock — источники и отрисовка

Проверено 2026-11-17. Все четыре листа нарисованы собственным кодом
`build_clawd.py` через Python/Pillow. Готовые PNG, GIF и SVG не копировались.
Генерация изображений не применялась. Анимации, ноутбук, флажок и аксессуары
нарисованы здесь заново целочисленными прямоугольниками.

## Канон: ClawdMoji, 12×8

- [Страница Kompozy](https://kompozy.io/ai-tools/clawdmoji) — описание проекта.
- [Репозиторий afspies/ClawdMoji](https://github.com/afspies/ClawdMoji).
- [Точная матрица и цвет, shared/clawd.py](https://github.com/afspies/ClawdMoji/blob/f87fc75f0c61bcfe14050b6f97fd3d697f5ba5ed/shared/clawd.py).
- [Базовый рендер](https://github.com/afspies/ClawdMoji/blob/f87fc75f0c61bcfe14050b6f97fd3d697f5ba5ed/emoji/base/render.py).
- [Лицензия и оговорка о правах на персонажа](https://github.com/afspies/ClawdMoji/blob/f87fc75f0c61bcfe14050b6f97fd3d697f5ba5ed/LICENSE).
- Проверенная ревизия: `f87fc75f0c61bcfe14050b6f97fd3d697f5ba5ed`.

Из исходника взяты только матрица формы и значение цвета. `#` — тело
`#DA7758`, `O` — непрозрачный чёрный глаз, `.` — прозрачность:

```text
..########..
..#O####O#..
############
############
..########..
..########..
..#.#..#.#..
..#.#..#.#..
```

База — ровно 12×8 клеток, каждая 5×5 экранных пикселей: габарит 60×40.
В кадре 96×104 начало сетки `(18,60)`, последняя строка ножек — `y=99`.
Широкие две строки образуют ручки; внизу четыре отдельные ножки.
Базовая поза clawd.webp кадра row0/col0 проверяется кодом по всем 96 клеткам.
Нет белой обводки, тени, сглаживания и полупрозрачных пикселей.
Глаза при моргании — чёрная полоса 5×1 внутри исходного квадрата 5×5;
крестики ошибки — две целочисленные диагонали в том же квадрате.
Эти детали и ручка кружки используют отдельные экранные пиксели без сглаживания.

Терминальный баннер из задания — ориентир общей формы. Его буквальная
развёртка квадрантов 18×6 имеет другие пропорции. Для листов выбрана явная
матрица ClawdMoji 12×8, а не смесь двух сеток.

## Дополнительная сверка: clawd-pet

- [Репозиторий abderrahimghazali/clawd-pet](https://github.com/abderrahimghazali/clawd-pet).
- [Галерея](https://clawd-pet.vercel.app/).
- [Базовая геометрия SVG](https://github.com/abderrahimghazali/clawd-pet/blob/b208f0c04a4084a17f4e5f5adf5198a752be0b36/public/pets/clawd-static-base.svg).
- [Вариант с машущей ручкой](https://github.com/abderrahimghazali/clawd-pet/blob/b208f0c04a4084a17f4e5f5adf5198a752be0b36/public/pets/clawd-waving.svg).
- [MIT LICENSE](https://github.com/abderrahimghazali/clawd-pet/blob/b208f0c04a4084a17f4e5f5adf5198a752be0b36/LICENSE).
- Проверенная ревизия: `b208f0c04a4084a17f4e5f5adf5198a752be0b36`.

Здесь другая базовая геометрия: viewBox 15×16, торс 11×7,
боковые ручки 2×2, четыре ножки 1×2, глаза 1×2, цвет `#DE886D`.
Подтверждены узнаваемые признаки и отдельное движение ручки.
SVG, тени и CSS-анимации в наши листы не переносились.
Идеи наушников и шапочки из задания реализованы собственными формами;
готовые аксессуары clawd-on-desk и agents-deck не использовались.

## Формат и повторная сборка

`python3 build_clawd.py` создаёт четыре lossless WebP 768×1144,
превью PNG на тёмном фоне и `clawd-validation.json`.
Сетка листа 8×11, кадр 96×104. Активные строки и число кадров:
`0:7, 3:4, 4:5, 5:8, 6:6, 7:6, 8:6` (42 кадра на лист).
Все остальные ячейки прозрачны. Превью показывает все 11 строк в масштабе
2× с NEAREST, включая пустые строки. Пиксели листов имеют alpha только 0/255.

Линия пола `y=99` совпадает с видимой опорой codex.webp:
его alpha>16 bbox в первом кадре `(12,15,84,100)`;
ниже лежат лишь значения alpha 14, 2, 1. Clawd не воспроизводит эту дымку.
Для новых записей meta.js используется точный bbox альфа-канала row0/col0
в координатах кадра 96×104: `x,y,w,h`. Старые записи сохраняются.
Движущиеся аксессуары следуют за головой; кружка в простое в руке,
в прочих анимациях стоит справа на полу.

## Лицензии

MIT ClawdMoji распространяется на КОД репозитория. Его LICENSE отдельно
указывает: права на Clawd и знак Anthropic принадлежат Anthropic, PBC;
лицензия проекта не предоставляет и не подразумевает прав на персонажа.
Это неофициальная фанатская работа, а не официальный ассет Anthropic.

### ClawdMoji notice

```text
MIT License

Copyright (c) 2026 afspies

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Scope note: this license covers the CODE in this repository (the render
scripts, tools, and build machinery). The "Clawd" character and the Anthropic
spark mark belong to Anthropic, PBC — this is an unofficial fan project, and
no rights to the character or mark are granted or implied.
```

### clawd-pet notice

MIT License, Copyright (c) 2026 Abderrahim GHAZALI.
Текст разрешения, условия сохранения notice и отказа от гарантий MIT
совпадает с приведённым выше MIT; отдельная оговорка ClawdMoji к этому
репозиторию не приписывается. В этой работе clawd-pet служит только
сверочным источником; его код и готовые изображения не включены.
