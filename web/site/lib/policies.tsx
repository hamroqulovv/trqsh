import Link from "next/link";
import type { ReactNode } from "react";
import { site } from "./site";

export const policyUpdatedOn = "2026-10-20";
export const policyLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms of service" },
  { href: "/cookies", label: "Cookies & storage" },
  { href: "/acceptable-use", label: "Acceptable use" },
] as const;

export interface PolicyDocument {
  href: string;
  title: string;
  introduction: string;
  readingTime: string;
  summary: { label: string; text: string }[];
  sections: { id: string; title: string; content: ReactNode }[];
}

const email = <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>;

export const privacyPolicy: PolicyDocument = {
  href: "/privacy",
  title: "Privacy policy.",
  introduction: "Understand what passes through trqsh, what stays on your computer, and how to ask for help with your data.",
  readingTime: "7 min read",
  summary: [
    { label: "Account & usage", text: "We keep the account and connection records needed to operate your tunnels." },
    { label: "Local inspection", text: "HTTP captures live in the agent’s memory on your computer." },
    { label: "A direct contact", text: "Write to hello@trqsh.uz for privacy questions or data requests." },
  ],
  sections: [
    { id: "who-we-are", title: "Who this policy covers", content: <>
      <p>trqsh is a tunneling project created and maintained by Otabek Hamroqulov. This policy describes the trqsh website, hosted Control API, dashboard, and the trqsh CLI and desktop app when connected to the hosted service. Contact {email} about this policy.</p>
      <p>If you connect to a self-hosted installation, its operator controls the server-side data and infrastructure. Ask that operator for its privacy terms. Websites and services published through a tunnel have their own operators and privacy practices.</p>
    </> },
    { id: "information", title: "Information we process", content: <>
      <div className="policy-table" tabIndex={0} role="region" aria-label="Account and connection data"><table><thead><tr><th>Information</th><th>What it includes and why</th></tr></thead><tbody>
        <tr><td>Account and profile</td><td>Email address, display name, avatar URL, sign-in provider, account identifier, and creation date. These identify your account and display your profile.</td></tr>
        <tr><td>Workspace and access</td><td>Organization membership and roles; API-key name, identifier, prefix, hash, creation, last-use and revocation records; reserved subdomains and custom-domain verification records.</td></tr>
        <tr><td>Tunnel and usage history</td><td>Public address, tunnel type and identifier, edge/region, connection start and end times, status, transferred bytes, and request counts. These power history, usage views, and plan limits.</td></tr>
        <tr><td>Connection information</td><td>The agent’s public IP address and, when location resolution is configured, approximate country or city. Servers and network proxies also process connection data to route requests and control abuse.</td></tr>
        <tr><td>Plan and support records</td><td>Your plan, activation or expiry details, and the information you send us when requesting an upgrade, support, or a privacy action. An installation using optional Stripe billing also keeps billing customer and subscription identifiers, status, and usage records.</td></tr>
      </tbody></table></div>
      <p>We use these records to authenticate accounts, authorize tunnels, enforce quotas, troubleshoot faults, and respond to misuse. You can browse the public documentation without creating an account; operating hosted tunnels requires credentials.</p>
    </> },
    { id: "traffic", title: "Tunnel traffic and local captures", content: <>
      <p>For normal HTTP tunnels, public HTTPS ends at the edge, which handles the request before forwarding it to the agent over encrypted transport. This is not end-to-end encryption between the visitor and your local app. The ordinary local HTTP destination is reached over plain HTTP; an application carried through a raw TCP tunnel can provide its own encryption.</p>
      <p>The local HTTP inspector records request and response headers, paths, timing, status, and bounded bodies. The standard agent holds up to <strong>256 exchanges in memory</strong>, with up to <strong>64 KiB per request body and per response body</strong>. Captures can include cookies, authorization headers, and private payloads.</p>
      <p>Older captures are replaced when the buffer fills. Clearing the recorder or stopping its agent removes those in-memory captures. Turning off the inspector’s browser listener does not turn off the core recorder. Normal local inspection does not automatically upload these bodies to a cloud capture archive; the dashboard’s cloud-inspector integration is not currently implemented.</p>
      <p>Usage counters and tunnel history are separate from capture bodies. Network proxies and your exposed app can process or log requests under their own configuration. Read the <Link href="/docs/inspector">inspector guide</Link> and <Link href="/docs/security">security guide</Link> for the boundaries.</p>
    </> },
    { id: "local-data", title: "Local configuration and logs", content: <>
      <p>The CLI saves configuration, saved tunnel definitions, and its working API key on your computer, normally in <code>~/.trqsh/trqsh.yml</code>. Runtime files can include the local control token and <code>daemon.log</code>. These files are separate from the in-memory HTTP capture buffer and can remain after the agent stops.</p>
      <p>Protect this directory and review logs before sharing them. Client removal and local-data removal are separate operations; the installation guide explains <code>/uninstall yes</code> and package-manager removal. Neither action deletes your hosted account. See <Link href="/docs/installation">Installation</Link> and <Link href="/docs/configuration">Configuration</Link>.</p>
    </> },
    { id: "remote-control", title: "QR remote-control sessions", content: <>
      <p>Using <code>/qr</code> sends recent console transcript lines and a tunnel-state snapshot through the hosted relay to paired viewers. The relay retains up to 200 recent lines and the last state snapshot in the API process. Pairings expire after 30 minutes and do not survive an API restart; you can end a pairing with <code>/qr stop</code>.</p>
      <p>Anyone holding an active pairing link or code can view the shared information and issue allowed console commands without a separate viewer login. Treat that link like a temporary credential. See <Link href="/docs/remote-control">QR remote control</Link>.</p>
    </> },
    { id: "providers", title: "Other services involved", content: <>
      <p>If you choose a configured GitHub or Google sign-in option, that provider handles your sign-in and returns profile information to trqsh. Its privacy policy also applies. The website’s upgrade flow sends you to Telegram; Telegram processes messages you choose to send there.</p>
      <p>The backend supports optional Stripe billing. If that integration is enabled for your installation and you use it, payment details are entered on Stripe’s hosted pages; trqsh receives the billing identifiers and subscription information needed to manage the plan. The current public website’s upgrade flow is manual rather than a card checkout.</p>
      <p>Hosting, database, DNS, and network-proxy operators can process the information needed to deliver their part of the service. A deployment using Cloudflare routes requests through Cloudflare. If an external IP-location lookup is enabled, the configured provider receives the public IP being resolved; the code also supports location from a trusted proxy header without that external lookup.</p>
      <p>Provider choices and physical storage locations depend on the deployment. Contact {email} for current hosting and processing-location details, including before sending data that must remain in a particular country. The service does not promise a specific data-residency region.</p>
      <p>Information may also need to be disclosed to comply with applicable law or investigate abuse. Public issues and release discussions are visible to others; use email for personal account information.</p>
    </> },
    { id: "storage", title: "Cookies, browser storage, and retention", content: <>
      <p>The dashboard uses authentication cookies, and sign-in can use short-lived security cookies. The public website saves your chosen light or dark theme in local storage. The website source does not embed advertising or third-party analytics scripts. See <Link href="/cookies">Cookies &amp; storage</Link> for details and controls.</p>
      <p>Account, domain, tunnel-history, and usage records persist in server storage. There is no published fixed deletion schedule for those records, and the current product does not automatically erase an account when you sign out or uninstall the client. We assess deletion requests against the information needed to operate the account, resolve disputes, investigate abuse, and meet applicable recordkeeping obligations.</p>
      <p>Local captures and remote pairings have the limits described above. Browser theme preferences remain until you replace them or clear site storage. Backup and infrastructure-log retention depends on the operator’s configuration; contact us for details rather than assuming immediate deletion from every copy.</p>
    </> },
    { id: "choices", title: "Your choices and data requests", content: <>
      <p>Contact {email} to request access to, correction of, or deletion of your personal account information. Include the email associated with your account and what you need. We may need to verify ownership before acting. The dashboard currently has no complete self-service account export or deletion flow.</p>
      <p>You can revoke API keys, stop tunnels, clear local captures, end QR pairings, and clear browser storage. Revoking a key prevents it from being used for later authentication; stop active tunnels separately when you need to end exposure. Uninstalling a client does not delete server-side account records.</p>
      <p>Depending on the law that applies to you, you may also have rights to restrict or object to processing, receive a portable copy, or complain to a data-protection authority. Tell us where you are located when relevant to your request.</p>
    </> },
    { id: "updates", title: "Keeping this policy current", content: <>
      <p>We update this page when the described practices change and revise the date above. Software release notes are available in the <Link href="/changelog">changelog</Link>. Questions about a change can be sent to {email}.</p>
    </> },
  ],
};

export const termsPolicy: PolicyDocument = {
  href: "/terms",
  title: "Terms of service.",
  introduction: "The practical agreement for using hosted trqsh: your account, your tunnels, and what to expect from the service.",
  readingTime: "5 min read",
  summary: [
    { label: "Your services", text: "Expose only apps, systems, and data you are authorized to share." },
    { label: "Clear plan limits", text: "Features and quotas depend on your active plan and the configured edge." },
    { label: "Open source", text: "Source-code rights come from the license distributed with that version." },
  ],
  sections: [
    { id: "agreement", title: "The agreement", content: <>
      <p>These terms apply to the hosted trqsh website, dashboard, Control API, and tunnel service maintained by Otabek Hamroqulov. By creating an account or using the hosted service, you agree to these terms and the <Link href="/acceptable-use">Acceptable use policy</Link>. If you act for an organization, you must have authority to accept on its behalf.</p>
      <p>You must be legally able to enter this agreement. If you do not agree, stop using the hosted service. These terms do not replace the software license for copies you download or self-host. Contact {email} about the agreement.</p>
    </> },
    { id: "account", title: "Accounts and credentials", content: <>
      <p>Provide accurate account information and protect your sign-in account, API keys, local configuration, and QR pairing links. You are responsible for the tunnels you create and for activity you authorize through your account.</p>
      <p>API keys are returned in full when created; store them securely. Revoke exposed keys and stop affected tunnels. Do not share credentials in public issues, screenshots, or support messages. Contact {email} if you believe your account has been accessed without permission.</p>
    </> },
    { id: "exposure", title: "Public exposure and your content", content: <>
      <p>trqsh forwards connections to the destination you configure. It does not start your application or add application-level authorization automatically. Anyone who learns a public tunnel address may be able to reach it. Use your application’s authentication and suitable tunnel controls.</p>
      <p>You retain your rights to your applications and content. You authorize the processing and transmission needed to route your traffic, provide chosen features, and operate the service. You are responsible for obtaining any permissions needed to expose data belonging to other people.</p>
      <p>Do not expose the agent control API, local inspector, credentials, or private management interfaces by accident. Review <Link href="/docs/security">Security &amp; privacy</Link> before publishing a sensitive service.</p>
    </> },
    { id: "plans", title: "Plans, upgrades, and payments", content: <>
      <p>The <Link href="/pricing">pricing page</Link> describes the public plans. Available protocols, simultaneous tunnels, names, domains, and traffic allowances depend on your active entitlement and the edge’s networking setup. A successful payment or plan change does not configure missing DNS, TLS, or ingress for a self-hosted installation.</p>
      <p>The website currently handles paid upgrade requests through the <Link href="/upgrade">Telegram contact flow</Link>. It does not provide a self-service card checkout. Confirm the price, currency, payment method, activation period, renewal arrangement, and any cancellation or refund terms with us before paying.</p>
      <p>Manually activated plans may have an expiry and return to Free when it is reached. The service can refuse new operations when a quota or entitlement is exceeded. Contact {email} about a payment, cancellation, refund request, or incorrect activation. Nothing here removes consumer rights that applicable law makes mandatory.</p>
    </> },
    { id: "availability", title: "Availability and product changes", content: <>
      <p>trqsh is actively developed. Connections may be interrupted by maintenance, updates, network conditions, resource limits, or failures in services we depend on. Unless separately agreed in writing, we do not promise uninterrupted availability, a particular response time, or a service-level credit.</p>
      <p>Random addresses and allocated ports are not permanent reservations. Use an available reserved-name or verified-domain feature when you need a stable address. Keep your own copies of important data; the inspector is a bounded local troubleshooting tool, not a backup or persistent archive.</p>
      <p>We may change features and plans. Published software changes appear in the <Link href="/changelog">changelog</Link>; review the current documentation for supported behavior.</p>
    </> },
    { id: "suspension", title: "Suspension and ending use", content: <>
      <p>We may restrict a tunnel or account to address abuse, unauthorized access, a serious security risk, legal obligations, or a breach of these terms. We may act immediately when needed to protect people or the service. Contact {email} if you believe a restriction is mistaken.</p>
      <p>You can stop your tunnels and stop using trqsh at any time. To request deletion of hosted account data, contact {email}; uninstalling the client or signing out does not erase it. Data handling is described in the <Link href="/privacy">Privacy policy</Link>.</p>
    </> },
    { id: "license", title: "Open-source software and third parties", content: <>
      <p>The current repository is distributed under the <a href={`${site.githubUrl}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">Apache License 2.0</a>. Check the license bundled with the particular release or dependency you use. A proposed future licensing change does not change rights granted for an already published version.</p>
      <p>Third-party sign-in, messaging, package hosting, and infrastructure services have their own terms. A link to one of those services does not make trqsh responsible for its availability or practices.</p>
    </> },
    { id: "responsibility", title: "Warranty and responsibility", content: <>
      <p>To the extent permitted by applicable law, the hosted service is provided “as is” and “as available,” without a guarantee that it will be uninterrupted, error-free, or suitable for your particular purpose. You are responsible for assessing whether it meets your reliability and security needs.</p>
      <p>To the extent permitted by law, trqsh and its maintainer are not responsible for indirect or consequential losses arising from use of the service, including lost profits or loss of business. These terms do not exclude liability or rights that cannot legally be excluded.</p>
    </> },
    { id: "changes", title: "Changes and contact", content: <>
      <p>Revised terms are published on this page with an updated date. If a change requires notice or renewed agreement under applicable law, that requirement still applies. Your use after revised terms take effect is subject to those terms.</p>
      <p>For questions, disputes, or requests relating to this agreement, write to {email} with enough information for us to identify the account and issue.</p>
    </> },
  ],
};

export const cookiesPolicy: PolicyDocument = {
  href: "/cookies",
  title: "Cookies & storage.",
  introduction: "A small amount of browser storage helps trqsh remember your theme and keep account access secure. Here is what it does.",
  readingTime: "3 min read",
  summary: [
    { label: "Preferences", text: "Your chosen theme stays in this browser until you change or remove it." },
    { label: "Account access", text: "Authentication cookies support sign-in and session security." },
    { label: "Your controls", text: "Use your browser’s site-data controls to inspect or remove stored data." },
  ],
  sections: [
    { id: "types", title: "What is stored", content: <>
      <div className="policy-table" tabIndex={0} role="region" aria-label="Browser storage and cookie lifetimes"><table><thead><tr><th>Storage</th><th>Purpose</th><th>Lifetime</th></tr></thead><tbody>
        <tr><td>Theme preference<br /><code>localStorage: theme</code></td><td>Stores “light” or “dark” after you choose a theme. Without a saved preference, the site follows your device setting.</td><td>Until you change the preference or clear site storage. Local storage has no automatic cookie-style expiry.</td></tr>
        <tr><td>Access and refresh cookies</td><td>Authenticate dashboard requests and maintain your signed-in session. Session cookies are HttpOnly so browser scripts cannot read their contents.</td><td>Access tokens have an expiry; refresh cookies can last up to 30 days. Signing out clears the relevant session cookies.</td></tr>
        <tr><td>Sign-in security cookies</td><td>Bind a sign-in attempt to the browser that started it and help prevent sign-in request forgery. These appear when the relevant login flow is used.</td><td>Short-lived and cleared or expired by the sign-in flow.</td></tr>
      </tbody></table></div>
      <p>Cookie names and paths can differ between HTTPS and local development installations. HTTPS deployments use Secure authentication cookies. Cookies used by a third-party sign-in provider belong to that provider.</p>
    </> },
    { id: "tracking", title: "Advertising, analytics, and third parties", content: <>
      <p>The public website source does not include advertising cookies or third-party analytics scripts. You do not need a trqsh account to read the public pages, and the theme preference is stored locally rather than sent to an advertising service.</p>
      <p>Following a GitHub, Google sign-in, Telegram, or download link takes you to a service with its own storage practices. A network proxy such as Cloudflare may also apply its own security controls to the connection. These are separate from the theme preference and dashboard cookies described here.</p>
    </> },
    { id: "controls", title: "How to manage browser storage", content: <>
      <p>Use the theme button in the site header to replace your saved preference. Use your browser’s privacy or site-settings controls to inspect cookies, block them, or clear cookies and local storage for the trqsh origin you visited.</p>
      <p>Clearing site data can sign you out and reset your theme. Blocking authentication cookies can prevent sign-in from working. Clearing browser data does not revoke CLI API keys, stop tunnels, or delete hosted account records; manage those separately.</p>
    </> },
    { id: "questions", title: "Questions and related policies", content: <>
      <p>The <Link href="/privacy">Privacy policy</Link> covers account, traffic, and server-side records. Write to {email} if you have a question about browser storage or notice behavior that differs from this page.</p>
    </> },
  ],
};

export const acceptableUsePolicy: PolicyDocument = {
  href: "/acceptable-use",
  title: "Acceptable use.",
  introduction: "Make useful things accessible. Keep the people, networks, and services on the other side of your tunnel safe.",
  readingTime: "3 min read",
  summary: [
    { label: "Have permission", text: "Only expose systems and data you have the right to share." },
    { label: "Protect others", text: "No phishing, malware, unauthorized access, or abusive traffic." },
    { label: "Report a concern", text: "Send the hostname and relevant details to hello@trqsh.uz." },
  ],
  sections: [
    { id: "authorized-use", title: "Use systems you are authorized to expose", content: <>
      <p>Use trqsh for legitimate development, previews, webhook delivery, testing, or other lawful connectivity. You must have permission to publish the service, use any configured domain, and transmit the content going through it.</p>
      <p>Keep sensitive development interfaces behind appropriate authentication. A difficult-to-guess hostname is not a security control. Follow the <Link href="/docs/security">security guide</Link> when exposing local services.</p>
    </> },
    { id: "prohibited", title: "Prohibited activity", content: <>
      <ul>
        <li>Phishing pages, credential theft, impersonation intended to deceive, or fraud.</li>
        <li>Malware distribution, botnet control, exploitation of other people’s systems, or unauthorized collection of their data.</li>
        <li>Spam, denial-of-service traffic, abusive scanning, or attempts to disrupt other users or networks.</li>
        <li>Publishing illegal content, violating intellectual-property or privacy rights, or sharing personal data without the necessary authorization.</li>
        <li>Bypassing quotas, rate limits, account restrictions, domain verification, or security controls.</li>
        <li>Stealing or sharing account credentials, API keys, or pairing links without authorization.</li>
      </ul>
      <p>Security testing must be limited to systems for which you have explicit authorization and must avoid disrupting other users or collecting their private information.</p>
    </> },
    { id: "enforcement", title: "How we respond", content: <>
      <p>We may investigate reports, restrict a hostname or tunnel, revoke access, or suspend an account when activity violates this policy, threatens others, or creates a legal or security risk. Serious issues may require immediate action.</p>
      <p>Enforcement does not mean that every request or hostname has been reviewed or that abuse will always be detected automatically. You remain responsible for your application and the activity you permit through it. If you believe an action was mistaken, contact {email} with the affected account and hostname.</p>
    </> },
    { id: "report", title: "Report abuse or a security issue", content: <>
      <p>Send reports to {email}. Include the full tunnel hostname or URL, the date and time with time zone, what you observed, and relevant evidence. For a vulnerability, include the affected component and version, impact, and safe reproduction steps.</p>
      <p>Do not put active credentials, private captured traffic, or an exploitable security issue in a public GitHub issue. If you include screenshots or logs, remove unrelated personal data and secrets. Sending a report does not require you to interact further with a suspicious service.</p>
    </> },
    { id: "related", title: "Related policies", content: <>
      <p>This policy forms part of the <Link href="/terms">Terms of service</Link>. The <Link href="/privacy">Privacy policy</Link> explains how account and connection records are handled. Contact {email} if a planned use is unclear.</p>
    </> },
  ],
};
