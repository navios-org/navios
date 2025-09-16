# Navios

Drop-in `axios` replacement for NodeJS and Next.JS with `axios` API based on native fetch implementation.

## Why?

`axios` is a great library, but it has some issues:

- It's not using native `fetch` API, so it's slow and buggy on backend
- It's not supporting Next.JS caching mechanism

## Installation

```bash
npm install --save navios
```

or

```bash
yarn add navios
```

## Usage

```js
import navios from 'navios'

navios.get('https://example.com').then((response) => {
  console.log(response.data)
})
```
