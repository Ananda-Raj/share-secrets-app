# Deploying SecretShare

This guide takes you from an empty AWS account to a working deployment. It should take
about 30–45 minutes, most of it waiting for CloudFront and clicking email confirmations.
To understand how the pieces fit together first, read [design.md](design.md).

## What you need

- An AWS account, and credentials that can create IAM roles, Lambda, API Gateway,
  DynamoDB, Cognito, SES, S3, CloudFront, CloudWatch, SNS and Budgets resources.
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [Terraform](https://developer.hashicorp.com/terraform/install) 1.10 or later
- [Node.js](https://nodejs.org/) 20 and npm
- An email address you can receive mail at. It becomes the sender address for the app's
  emails.
- Optional: an OIDC identity provider (Entra ID, Okta, Google Workspace, Auth0,
  Keycloak) if you want single sign-on.
- Optional: a domain name, if you don't want to use the default `*.cloudfront.net`
  address.

Every command below runs from the repository root unless it says otherwise.

## 1. Point the AWS CLI at your account

```bash
export AWS_PROFILE=<your-profile>
aws sts get-caller-identity
```

Terraform and the AWS CLI both read `AWS_PROFILE`, so keep it set in the terminal you
use for the rest of this guide. Leave `aws_profile` blank in `terraform.tfvars`.

## 2. Create a bucket for Terraform state

Terraform keeps its state in an S3 bucket that you create once, outside Terraform.
Bucket names are unique across all of AWS, so add a random suffix:

```bash
STATE_BUCKET="secretshare-tfstate-$(openssl rand -hex 4)"
aws s3api create-bucket --bucket "$STATE_BUCKET" --region us-east-1
aws s3api put-bucket-versioning --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled
echo "$STATE_BUCKET"   # write this down, you need it at every init
```

New S3 buckets block public access and encrypt objects by default. State locking uses
S3's own lock file (`use_lockfile`), so you don't need a DynamoDB lock table.

To keep the state bucket in another region, add
`--create-bucket-configuration LocationConstraint=<region>` to `create-bucket`. Then
also pass `-backend-config="region=<region>"` in step 6.

## 3. Choose how senders sign in

Pick one to start with. You can add the other later from the Admin page.

**Option A: email and password (quickest).** Anyone who can open the site can register.
This is the easiest way to try the app out. Set `allow_self_signup = true` and leave the
`oidc_*` settings blank. You can switch sign-up off later from the Admin page.

**Option B: single sign-on through your identity provider.** Register a new "web"
application with your provider. It asks for a redirect URI, which is:

```
https://<project_name>-<environment>-<account-id>.auth.<region>.amazoncognito.com/oauth2/idpresponse
```

With the defaults (`secure-secrets`, `dev`, `us-east-1`) and an account ID of
`111122223333`, that's
`https://secure-secrets-dev-111122223333.auth.us-east-1.amazoncognito.com/oauth2/idpresponse`.
You can print your account ID with
`aws sts get-caller-identity --query Account --output text`.

Then collect three values from the provider:

| Value | Entra ID example |
|---|---|
| Issuer URL | `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| Client ID | Application (client) ID |
| Client secret | Certificates & secrets → New client secret → the **Value** |

Other providers: Google uses `https://accounts.google.com` as the issuer, and Okta uses
`https://<your-org>.okta.com`. Allow the `openid`, `email` and `profile` scopes.

## 4. Fill in the settings

```bash
cp Infra/terraform.tfvars.example Infra/terraform.tfvars
```

Git ignores `terraform.tfvars`, so your values (including any client secret) stay on
your machine. Edit it:

| Setting | What to put |
|---|---|
| `aws_region` | Region for the whole stack. Default `us-east-1`. |
| `aws_profile` | Leave blank and use `AWS_PROFILE`. |
| `environment` | For example `dev` or `prod`. It's part of every resource name. |
| `project_name` | Prefix for every resource name. Default `secure-secrets`. |
| `ses_sender_email` | The From address for the app's emails. You must be able to receive mail there. |
| `budget_alert_emails` | Who gets the monthly spend alert. |
| `monitoring_alert_emails` | Who gets Lambda error and email bounce alerts. |
| `github_repository` | Your `owner/repo`, only needed for GitHub Actions deploys (step 11). |
| `create_github_oidc_provider` | `false` if this account already has GitHub's OIDC provider (see below). |
| `frontend_domain_name`, `acm_certificate_arn` | Leave blank for now (step 12). |
| `allow_self_signup` | `true` for option A. |
| `oidc_issuer_url`, `oidc_client_id`, `oidc_client_secret` | The three values from option B. |
| `oidc_idp_name` | The name shown on the sign-in button for option B, e.g. `CompanySSO`. |

An AWS account can have only one GitHub OIDC provider. To check whether yours already
has one:

```bash
aws iam list-open-id-connect-providers
```

If the output includes `token.actions.githubusercontent.com`, set
`create_github_oidc_provider = false`.

## 5. Build the backend

Terraform packages the backend from its build output, so build it first:

```bash
cd App-code/backend
npm ci
npm test
npm run build      # writes dist/index.js
cd ../..
```

## 6. Create the infrastructure

```bash
cd Infra
terraform init -backend-config="bucket=$STATE_BUCKET"
terraform plan -out=plan.tfplan
terraform apply plan.tfplan
cd ..
```

Read the plan before you apply it. The first apply takes about 5–10 minutes, mostly
for CloudFront.

The state is stored at `secure-secrets/terraform.tfstate`. To run a second environment
from the same bucket, pass a different key at init, for example
`-backend-config="key=secure-secrets/prod/terraform.tfstate"`.

## 7. Confirm the emails AWS sends you

The apply triggers some confirmation emails:

- **SES verification** goes to `ses_sender_email`. Click the link, or the app can't
  send anything.
- **SNS subscription confirmations** go to each `monitoring_alert_emails` address.
  Click **Confirm subscription** to receive alerts.

**SES sandbox.** New AWS accounts start in the SES sandbox, where you can only send
email to addresses you've verified. To try the app, verify each test recipient:

```bash
aws sesv2 create-email-identity --email-identity friend@example.com
```

The recipient then clicks the link AWS sends them. To email anyone, request production
access in the SES console (**Account dashboard → Request production access**). AWS
usually replies within a day. To check your status:

```bash
aws sesv2 get-account --query ProductionAccessEnabled
```

## 8. Build and upload the frontend

The frontend needs four values from Terraform at build time:

```bash
cd App-code/frontend
npm ci
export VITE_API_BASE_URL="$(terraform -chdir=../../Infra output -raw api_base_url)"
export VITE_COGNITO_DOMAIN="$(terraform -chdir=../../Infra output -raw cognito_domain)"
export VITE_COGNITO_CLIENT_ID="$(terraform -chdir=../../Infra output -raw cognito_client_id)"
# Option B only:
export VITE_COGNITO_IDP_NAME="$(terraform -chdir=../../Infra output -raw cognito_idp_name)"
npm run build

aws s3 sync dist "s3://$(terraform -chdir=../../Infra output -raw frontend_bucket_name)" --delete
aws cloudfront create-invalidation \
  --distribution-id "$(terraform -chdir=../../Infra output -raw cloudfront_distribution_id)" \
  --paths "/*"
cd ../..
```

## 9. Sign in and become admin

```bash
terraform -chdir=Infra output -raw frontend_url
```

Open that URL and sign in.

- **Option A:** choose **Sign up**, enter your email and a password, then enter the
  verification code Cognito emails you. Cognito's built-in email is limited to 50
  messages a day, which is fine for sign-up codes on a small team.
- **Option B:** sign in with your identity provider.

You're the first person to sign in, so you become admin automatically and the
**Admin** link appears.

Then make it yours:

- **Admin → Branding:** your organization's name, logo, accent color, support email and
  footer note.
- **Admin → Sharing rules:** who can send and receive, and for how long links stay
  available. If self-sign-up is open (option A), set **allowed sender domains** so that
  only your organization can send.
- **Admin → Activity:** tick **Email admins a monthly summary** to get one on the 1st of
  each month. **Send me a preview** shows you what it looks like straight away.

## 10. Send yourself a secret

1. On the home page, enter a recipient email you can read. While SES is in the
   sandbox, it must be a verified address (step 7).
2. Add a description and subject, then type a secret or attach a small file.
3. Open the email, preferably in a private browser window, enter the code and read
   the secret.
4. Reload the link. The secret is gone.
5. Check **History**: the send shows as opened.

You can also enter several recipients, separated by commas. Each gets their own link
and code. After sending, the page shows each link with a **Copy** button, in case you
want to share it in chat as well. Copy it then, because it can't be shown again.

## 11. Optional: deploy from GitHub Actions

The workflows only push application code to resources Terraform already created. They
authenticate with GitHub's OIDC, so no AWS keys are stored in GitHub.

1. Set `github_repository = "<owner>/<repo>"` in `terraform.tfvars` and apply again.
   The deploy role trusts only that exact repository.
2. In the repo, open **Settings → Secrets and variables → Actions** and add:

   | Type | Name | Value |
   |---|---|---|
   | Secret | `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw github_actions_role_arn` |
   | Variable | `AWS_REGION` | Your `aws_region` |
   | Variable | `BACKEND_FUNCTION_NAME` | `terraform output -raw backend_function_name` |
   | Variable | `FRONTEND_BUCKET_NAME` | `terraform output -raw frontend_bucket_name` |
   | Variable | `CLOUDFRONT_DISTRIBUTION_ID` | `terraform output -raw cloudfront_distribution_id` |
   | Variable | `API_BASE_URL` | `terraform output -raw api_base_url` |
   | Variable | `COGNITO_DOMAIN` | `terraform output -raw cognito_domain` |
   | Variable | `COGNITO_CLIENT_ID` | `terraform output -raw cognito_client_id` |
   | Variable | `COGNITO_IDP_NAME` | `terraform output -raw cognito_idp_name`, or empty for option A |

3. Go to **Actions → Deploy Backend** (or **Deploy Frontend**) and choose **Run
   workflow**.

To make the pull request checks binding, add a branch protection rule on `main`
(**Settings → Branches**) that requires **PR Checks** and
**Guard Infra / block-infra-changes** to pass.

The **Release** workflow tags `main` with the next version and creates a GitHub
release.

## 12. Optional: use your own domain

1. In **AWS Certificate Manager, in us-east-1** (CloudFront requires that region),
   request a certificate for your domain. Validate it through DNS and wait until it
   shows **Issued**.
2. Set `frontend_domain_name` and `acm_certificate_arn` in `terraform.tfvars`, then
   plan and apply. This also updates Cognito's allowed sign-in redirect to the new
   domain.
3. At your DNS provider, point the domain at
   `terraform output -raw cloudfront_distribution_domain_name`. Use a CNAME, or an
   alias record if the domain is in Route 53. Terraform doesn't manage DNS.

After this, sign-in works only on the custom domain, not on the `cloudfront.net`
address.

## Day-to-day operations

**Make someone else admin.** This is deliberately a direct database write, not a
button in the app (see [design.md](design.md#sign-in-and-roles)). Use their sign-in
email in lowercase:

```bash
aws dynamodb put-item \
  --table-name "$(terraform -chdir=Infra output -raw roles_table_name)" \
  --item '{"email": {"S": "person@example.com"}, "role": {"S": "admin"}}'
```

To remove admin, run `aws dynamodb delete-item` with
`--key '{"email": {"S": "person@example.com"}}'`.

**Deploy a backend change.** Run `npm run build` in `App-code/backend`, then
`terraform plan` and `terraform apply` in `Infra`. Alternatively, use the Deploy Backend
workflow (step 11).

**Deploy a frontend change.** Repeat step 8, or use the Deploy Frontend workflow.

**Change the infrastructure.** Edit `Infra/`, then run `plan` and `apply` from your own
machine. Terraform never runs in CI.

## Tear it all down

```bash
aws s3 rm "s3://$(terraform -chdir=Infra output -raw frontend_bucket_name)" --recursive
terraform -chdir=Infra destroy
```

Then delete the state bucket. It's versioned, so the simplest way is to choose
**Empty** and then **Delete** in the S3 console.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Apply fails with `EntityAlreadyExists` on the GitHub OIDC provider | Set `create_github_oidc_provider = false` (step 4). |
| Apply fails with "No way to log in" | Set `allow_self_signup = true` or fill in the `oidc_*` settings. |
| Apply fails because the Lambda source or zip is missing | Build the backend first (step 5). |
| No email arrives | The SES sender isn't verified, or the recipient isn't verified while you're in the sandbox (step 7). Check spam, then the Lambda's CloudWatch log group `/aws/lambda/<project>-lambda-<env>`. |
| The identity provider reports a redirect URI mismatch | Compare `terraform output -raw oidc_redirect_uri` with what's registered at the provider. |
| "Failed to fetch" after sign-in | The frontend was built with stale values. Rebuild with the current outputs (step 8). |
| Sign-in jumps straight to SSO when you want the sign-up form | `VITE_COGNITO_IDP_NAME` is set and self-sign-up is off. Turn sign-up on from the Admin page, or rebuild without the variable. |
| A sender sees "Sending isn't available" | Their email domain isn't in **Admin → Sharing rules → Allowed sender domains**. |
| The "opened" notification doesn't arrive | While SES is in the sandbox, the sender's address must be verified too (step 7). |
| The monthly summary or its preview doesn't arrive | While SES is in the sandbox, each admin's address must be verified (step 7). The schedule runs at 08:00 UTC on the 1st. The Lambda's log shows `summary.sent` or, if it's turned off, `summary.skipped`. |
| SSO configured from the Admin page stops working after an apply | Terraform and the Admin page are both managing the provider. Use one or the other. |
