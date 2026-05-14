import { get } from "aws-amplify/api";
import {
  confirmSignIn,
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
} from "aws-amplify/auth";
import { useEffect, useState, type FormEvent } from "react";
import outputs from "../amplify_outputs.json";

type HelloResponse = {
  message: string;
  time: string;
  staticValue: string;
};

type ViewKey = "home" | "api";

const apiNames = Object.keys(outputs.custom?.API ?? {});
const apiName = apiNames[0] ?? "";

const menuItems: Array<{ key: ViewKey; label: string }> = [
  { key: "home", label: "Home" },
  { key: "api", label: "Hello API" },
];

const App = () => {
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [requiresNewPassword, setRequiresNewPassword] = useState(false);
  const [activeView, setActiveView] = useState<ViewKey>("home");
  const [helloResponse, setHelloResponse] = useState<HelloResponse | null>(null);
  const [apiError, setApiError] = useState("");
  const [isLoadingApi, setIsLoadingApi] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadAuthState = async () => {
      try {
        await getCurrentUser();
        if (isMounted) {
          setIsAuthenticated(true);
        }
      } catch {
        if (isMounted) {
          setIsAuthenticated(false);
        }
      } finally {
        if (isMounted) {
          setIsLoadingAuth(false);
        }
      }
    };

    void loadAuthState();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || activeView !== "api") {
      return;
    }

    void loadHello();
  }, [activeView, isAuthenticated]);

  const loadHello = async () => {
    if (!apiName) {
      setApiError("No Amplify API is configured in amplify_outputs.json.");
      return;
    }

    setIsLoadingApi(true);
    setApiError("");

    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        setApiError("Your session is missing a Cognito token. Please sign in again.");
        return;
      }

      const operation = get({
        apiName,
        path: "/hello",
        options: {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        },
      });
      const response = await operation.response;
      const data = (await response.body.json()) as HelloResponse;

      setHelloResponse(data);
    } catch (error) {
      console.error(error);
      setApiError("Unable to load the hello response. If this keeps happening, sign out and sign back in.");
    } finally {
      setIsLoadingApi(false);
    }
  };

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmittingAuth(true);
    setAuthError("");

    try {
      const result = await signIn({
        username: email,
        password,
      });

      if (result.isSignedIn) {
        setIsAuthenticated(true);
        setPassword("");
        setNewPassword("");
        setRequiresNewPassword(false);
        return;
      }

      if (result.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
        setRequiresNewPassword(true);
        setAuthError("This user must set a new password before continuing.");
        return;
      }

      setAuthError(`Unsupported sign-in step: ${result.nextStep.signInStep}`);
    } catch (error) {
      console.error(error);
      setAuthError("Sign in failed. Check your email and password.");
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleCompleteNewPassword = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsSubmittingAuth(true);
    setAuthError("");

    try {
      const result = await confirmSignIn({
        challengeResponse: newPassword,
      });

      if (result.isSignedIn) {
        setIsAuthenticated(true);
        setPassword("");
        setNewPassword("");
        setRequiresNewPassword(false);
        return;
      }

      setAuthError("Additional verification is still required for this user.");
    } catch (error) {
      console.error(error);
      setAuthError("Unable to set the new password.");
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setIsAuthenticated(false);
    setHelloResponse(null);
    setApiError("");
    setActiveView("home");
  };

  if (isLoadingAuth) {
    return <main className="center-shell">Checking authentication...</main>;
  }

  if (!isAuthenticated) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">AWS Amplify</p>
          <h1>Minimal Cognito Sign In</h1>
          <p className="muted">
            Sign in with your Cognito user to open the React app and call the protected hello API.
          </p>

          {requiresNewPassword ? (
            <form className="auth-form" onSubmit={handleCompleteNewPassword}>
              <label>
                New password
                <input
                  autoComplete="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </label>

              {authError ? <p className="error-text">{authError}</p> : null}

              <button type="submit" disabled={isSubmittingAuth}>
                {isSubmittingAuth ? "Saving..." : "Set new password"}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleSignIn}>
              <label>
                Email
                <input
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>

              <label>
                Password
                <input
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>

              {authError ? <p className="error-text">{authError}</p> : null}

              <button type="submit" disabled={isSubmittingAuth}>
                {isSubmittingAuth ? "Signing in..." : "Sign in"}
              </button>
            </form>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="side-menu">
        <div>
          <p className="eyebrow">Minimal Amplify</p>
          <h1>Hello project</h1>
        </div>

        <nav className="menu-list" aria-label="Side menu">
          {menuItems.map((item) => (
            <button
              key={item.key}
              className={item.key === activeView ? "menu-item active" : "menu-item"}
              type="button"
              onClick={() => setActiveView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <button className="secondary-button" type="button" onClick={handleSignOut}>
          Sign out
        </button>
      </aside>

      <section className="content-panel">
        {activeView === "home" ? (
          <div className="panel-card">
            <p className="eyebrow">Overview</p>
            <h2>Bare minimal React app</h2>
            <p className="muted">
              This page keeps the frontend intentionally small: one Cognito sign-in screen,
              one side menu, and one API screen.
            </p>
          </div>
        ) : null}

        {activeView === "api" ? (
          <div className="panel-card">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Protected API</p>
                <h2>Hello world response</h2>
              </div>

              <button type="button" onClick={() => void loadHello()} disabled={isLoadingApi}>
                {isLoadingApi ? "Loading..." : "Refresh"}
              </button>
            </div>

            {apiError ? <p className="error-text">{apiError}</p> : null}

            {helloResponse ? (
              <dl className="response-grid">
                <div>
                  <dt>Message</dt>
                  <dd>{helloResponse.message}</dd>
                </div>
                <div>
                  <dt>Current time</dt>
                  <dd>{helloResponse.time}</dd>
                </div>
                <div>
                  <dt>DynamoDB value</dt>
                  <dd>{helloResponse.staticValue}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">
                Open this page to fetch the Lambda response from API Gateway.
              </p>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
};

export default App;
