# ariadne-rules

Part of [Ariadne Desk](../../README.md). CI builds, tests and measures
this crate with the rest of the repository; the badges and what each one
counts are in the root README.

The deterministic legal core of the desk, in Rust compiled to
WebAssembly: the rules a complaint is measured against, as plain
functions over plain data, each tested on worked examples written by
hand. The desk calls it from a Web Worker.

**Not legal advice.** The crate encodes a reading of the sources listed
below, at the revisions listed below. Where a reading is uncertain, the
crate encodes the conservative one and says so in the code and here. A
person decides every case.

Status: skeleton. The crate builds for the browser and exports its
version; the rules arrive in the following changes.

## Interface

Errors and refusals are codes, never sentences: the desk owns the
wording in each interface language.

The WebAssembly build (feature `wasm`) exports:

- `version()`: the crate version, as built.

## Sources

None yet: each rule added to the crate adds its source here, with the
revision it was checked against.

## Development

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo clippy --workspace --all-targets --locked --all-features -- -D warnings
cargo test --workspace --locked
wasm-pack build crates/ariadne-rules --release --target web --out-dir pkg --out-name ariadne_rules -- --no-default-features --features wasm
```

The minimum supported Rust version is 1.85, for the native build and the
`wasm32-unknown-unknown` target.
