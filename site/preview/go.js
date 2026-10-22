// The member area moved to /members/. Send old links (and sign-in or invite links in old
// emails) there, keeping ?invite= and any #sign-in tokens intact.
(function () {
  var page = location.pathname.split('/').pop();
  var keep = /^(findings|record)\.html$/.test(page) ? page : '';
  location.replace('/members/' + keep + location.search + location.hash);
})();
