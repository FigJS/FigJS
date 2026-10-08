# Third-party notices

FigJS is MIT-licensed (see `LICENSE`). It includes the following third-party
software and assets, each under its own license.

## GrapesJS 0.23.6 (BSD 3-Clause)

Files: `editor/vendor/grapes.min.js`, `editor/vendor/grapes.min.css`, the
unmodified build published on npm as `grapesjs@0.23.6`
(https://github.com/GrapesJS/grapesjs). Its license, reproduced verbatim
below, is also kept beside the files as `editor/vendor/grapesjs.LICENSE.txt`.
FigJS is not endorsed by GrapesJS or its contributors.

```
Copyright (c) 2017-current, Artur Arseniev
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

- Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.
- Redistributions in binary form must reproduce the above copyright notice, this
  list of conditions and the following disclaimer in the documentation and/or
  other materials provided with the distribution.
- Neither the name "GrapesJS" nor the names of its contributors may be
  used to endorse or promote products derived from this software without
  specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### Libraries bundled inside the GrapesJS build (MIT License)

| Package | Version | Copyright |
| --- | --- | --- |
| backbone | 1.4.1 | Copyright (c) 2010-2022 Jeremy Ashkenas, DocumentCloud |
| backbone-undo | 0.2.6 | Copyright (c) Oliver Sartun |
| codemirror | 5.63.0 | Copyright (C) 2017 by Marijn Haverbeke and others |
| codemirror-formatting | 1.0.0 | Copyright (c) Artur Arseniev |
| html-entities | 1.4.0 | Copyright (c) 2013 Dulin Marat |
| promise-polyfill | 8.3.0 | Copyright (c) 2014 Taylor Hakes; Copyright (c) 2014 Forbes Lindesay |
| underscore | 1.13.8 | Copyright (c) 2009-2022 Jeremy Ashkenas, Julian Gonggrijp, and DocumentCloud and Investigative Reporters & Editors |

Each is distributed under the MIT License:

```
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
```

## Blue-noise textures (CC0 1.0)

Files: `public/assets/noise/blue-noise-*.png`, from "Free blue noise textures"
by Christoph Peters (https://momentsingraphics.de/BlueNoise.html), dedicated
to the public domain under CC0 1.0.

## Not included

The launchers download Node.js from nodejs.org into `.runtime/` when no
Node.js 18+ is installed; it is not part of this repository.
