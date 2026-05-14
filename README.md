# Minimal Amplify React App

This project is a bare minimal Amplify Gen 2 app with:

- one React frontend
- one Cognito email/password sign-in page
- one protected API Gateway route
- one Lambda handler
- one DynamoDB table that stores a single static value

## What it does

After a user signs in with Cognito, the React app shows a simple side menu:

- `Home`
- `Hello API`

The `Hello API` screen calls `GET /hello`.

The Lambda returns:

```json
{
  "message": "Hello world",
  "time": "2026-05-11T12:34:56.000Z",
  "staticValue": "Stored in DynamoDB"
}
```

If the DynamoDB item does not exist yet, the Lambda creates it first and then returns the default static value.

## Backend shape

- Auth: Cognito user pool with email sign-in
- API: API Gateway HTTP API with Cognito authorizer
- Function: `hello-world`
- Table: DynamoDB table with:
  - partition key `pk`
  - sort key `sk`

The Lambda reads this item:

- `pk`: `CONFIG`
- `sk`: `HELLO`

The stored attribute is:

- `value`: static text returned by the API

## Run locally

Install dependencies:

```bash
npm install
```

Start the Amplify sandbox:

```bash
npx ampx sandbox
```

In another terminal, regenerate outputs if needed:

```bash
npx ampx generate outputs
```

Start the React app:

```bash
npm run dev
```

## Cognito user

Create a Cognito user for the generated user pool, then sign in on the app with that email and password.

## Test the Lambda

```bash
npm run test:lambda
```

## Notes

- `amplify_outputs.json` should be regenerated after starting a fresh sandbox or deploy.
- The frontend reads the first REST API entry from `amplify_outputs.json`.
