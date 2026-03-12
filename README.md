This is a Next.js application.

## Getting Started

Required toolchain:

- Node.js `22.22.1`
- `pnpm` `10.23.0`

Use one of the repo pins before installing dependencies:

```bash
nvm use
# or
asdf install
# or
mise install
```

Then install dependencies and run the development server:

```bash
pnpm install
pnpm dev
```

Local development enforces the exact Node.js version above through `.nvmrc`, `.node-version`, `.tool-versions`, Volta metadata, and `scripts/check-node-version.mjs`.

`package.json#engines.node` intentionally uses `22.x` instead of an exact patch so Vercel and other hosted builders can use the latest supported Node 22 runtime. For Vercel deployments, make sure the project Node.js version is set to `22.x`. The repo still pins local development to `22.22.1` so installs, CI, and production builds stay aligned with a known-good toolchain.

Open [http://localhost:3003](http://localhost:3003) with your browser to see the result.

You can start editing the page by modifying files under [`src`](/workspaces/aptus/src).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
