// Server entrypoint

// ----------------------------------------------------------------------------
// IMPORTS

/* NPM */
import "cross-fetch/polyfill";

import { Context } from "koa";

import * as React from "react";
import { ApolloProvider, getDataFromTree } from "react-apollo";

// React utility to transform JSX to HTML (to send back to the client)
import * as ReactDOMServer from "react-dom/server";

// <Helmet> component for retrieving <head> section, so we can set page
// title, meta info, etc along with the initial HTML
import Helmet from "react-helmet";

import { StaticRouter } from "react-router";
import { ServerStyleSheet, StyleSheetManager } from "styled-components";

/* Local */
import Root from "@/components/root";
import { createClient } from "@/graphql/apollo";
import Output from "@/lib/output";
import { ThemeProvider } from "@/lib/styledComponents";
import defaultTheme from "@/themes/default";
import Html from "@/views/ssr";

// ----------------------------------------------------------------------------

// Types
export interface IRouterContext {
  status?: number;
  url?: string;
}

export default function(output: Output) {

  // Create Koa middleware to handle React requests
  return async (ctx: Context) => {

    // Create a new Apollo client
    const client = createClient();

    // Create a new styled-components instance
    const sheet = new ServerStyleSheet();

    // Create a fresh 'context' for React Router
    const routerContext: IRouterContext = {};

    const components = (
      <StyleSheetManager sheet={sheet.instance}>
        <ThemeProvider theme={defaultTheme}>
          <ApolloProvider client={client}>
            <StaticRouter location={ctx.request.url} context={routerContext}>
              <Root />
            </StaticRouter>
          </ApolloProvider>
        </ThemeProvider>
      </StyleSheetManager>
    );

    // Render the Apollo tree
    await getDataFromTree(components);

    // Handle redirects
    if ([301, 302].includes(routerContext.status!)) {
      // 301 = permanent redirect, 302 = temporary
      ctx.status = routerContext.status!;

      // Issue the new `Location:` header
      ctx.redirect(routerContext.url!);

      // Return early -- no need to set a response body
      return;
    }

    // Handle 404 Not Found
    if (routerContext.status === 404) {
      // By default, just set the status code to 404.  Or, we can use
      // `config.set404Handler()` to pass in a custom handler func that takes
      // the `ctx` and store

      // TODO - add error handling

      ctx.status = 404;
      ctx.body = "Not found";

      return;
    }

    // Create the React render via React Helmet
    const reactRender = ReactDOMServer.renderToString(
      <Html
        css={output.client.main("css")!}
        helmet={Helmet.renderStatic()}
        js={output.client.main("js")!}
        styles={sheet.getStyleElement()}
        window={{
          __APOLLO_STATE__: client.extract(),
        }}>
        {components}
      </Html>,
    );

    // Set the return type to `text/html`, and stream the response back to
    // the client
    ctx.type = "text/html";
    ctx.body = `<!DOCTYPE html>${reactRender}`;
  };
}
