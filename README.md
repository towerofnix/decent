# Bantisocial

## It's time to ditch Discord.

All-in-one text chat for people that's free as in freedom *and* beer, and works on your desktop.

Stop using proprietary software and using a chat site which is actually competitive. Simplify your life.

[Download for Any System](https://github.com/towerofnix/bantisocial/archive/master.zip)<br>
[Open Bantisocial](#getting-started)

## Getting Started

Getting started is Fast and Easy <sup>(if you are experienced with computers <sup>(it is assumed that you are, or else you would probably not know of or care about this <sub>(Did we just assume you care about this?)</sub>)</sup>)</sup>.

### Prerequisites

You will need:

* Node.js. Ideally a very, very recent version. You can use nvm to make installing it a lot easier.

* A web browser. Probably a very, very, very cutting-edge browser. We're testing Bantisocial in Firefox Nightly, but you probably don't need the nightly version. Just run the latest release of your favorite browser.

* If you want to use a browser that isn't Firefox Nightly (see below), you'll need to run the build script, which requires Parcel and Rust (get Rust, then do `cargo install parcel`).

### Installing/running

```
$ git clone https://github.com/towerofnix/bantisocial.git
$ cd bantisocial
$ npm install
$ node .
# open http://localhost:3000
```

Try clicking on Register. If the button doesn't do anything..

* ..and you're on Firefox Nightly, change the configuration flag `dom.moduleScripts.enabled` to **true**.
* ..and you're on any other browser, stop node and build the folder. That means getting Rust and Parcel (see preqreuisites), and then running `npm run build`. After that, start up node again (`node .`) and reload the browser page. Then try clicking on Register.

You'll probably need to make a channel, but to do that, you'll need to make an admin user. Start by registering a user through your web browser (just click on the register button); once you've done that, type `make-admin (the username you picked)` into the `node` process:

```
$ node .
bantisocial - listening on port 3000
> make-admin avjoe
Made avjoe an admin.
```

Then you can create a channel by logging in on the browser (you know, click the "login" button) and clicking on the "New" button next to the (empty) channel list.
