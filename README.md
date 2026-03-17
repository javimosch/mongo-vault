# MongoVault (MV)

MongoVault is an easy-to-use solution for backing up MongoDB containers running on a remote host via SSH. While it was initially developed for Coolify hosts, it is not strictly required.

## Features
- Scheduled remote MongoDB backups.
- Simple dashboard for monitoring backup status and disk usage.
- Database size estimation from target host.
- Host disk usage metrics.

## Getting Started
### Prerequisites
- Node.js installed on the host.
- SSH access to the remote MongoDB server.
- Remote MongoDB container name or container ID.

### Installation
1. Clone the repository: `git clone git@github.com:javimosch/mongo-vault.git`
2. Install dependencies: `npm install`
3. Configure environment variables (if needed).
4. Run the application: `npm start`

## License
MIT License

Copyright (c) 2026 Javier Leandro Arancibia

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
