// ============================================================================
// Nova Forma extension — entry point STUB (FM-M0)
// ----------------------------------------------------------------------------
// Option B (docs/architecture/forma-connect.md): this thin extension runs inside
// Forma's iframe, owns all Forma Embedded View SDK calls, and relays request/
// response envelopes to/from a Cloudflare Durable Object pairing room that the
// standalone Nova app (NovaFormaBridge) also joins.
//
// FM-M0 SKELETON: no live SDK calls, no relay connection. This entry only
// declares the FM-M1 wiring plan and renders a placeholder. It performs NO
// network or SDK I/O so it is safe to load.
//
// Authored as a plain browser script (no import/export) so the FM-M0 scaffold
// is lint-clean under the repo's non-src `sourceType: script` rule. FM-M1
// converts this to an ESM bundle (with its own build config) when it imports
// the Forma SDK and the shared Forma protocol validators.
// ============================================================================

(function bootstrapNovaFormaExtension() {
  var FM0_STATUS = {
    milestone: 'FM-M0',
    live: false,
    // The shared Forma protocol message types live in the Nova app bridge
    // (src/integrations/forma/forma-bridge.js). FM-M1 imports the validator
    // there so both relay peers validate the SAME envelopes.
    pairing: 'pending FM-M1',
    sdk: 'pending FM-M1',
    relay: 'pending FM-M1'
  };

  // FM-M1 will implement, in order:
  //   1. initFormaSdk()    — import the Embedded View SDK, confirm Forma host.
  //   2. joinPairingRoom() — connect to the DO pairing room with the pairing
  //                          code as the `forma-extension` peer.
  //   3. startRelayLoop()  — for each validated request envelope, dispatch the
  //                          matching Forma.* SDK call and relay the response.
  // FM-M0 ships none of these; this only marks intent and is inert.

  if (typeof console !== 'undefined' && console.info) {
    console.info('[Nova Forma extension] FM-M0 skeleton loaded — SDK + relay wired in FM-M1.', FM0_STATUS);
  }

  return FM0_STATUS;
})();
