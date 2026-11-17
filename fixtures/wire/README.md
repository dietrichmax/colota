# Wire fixtures

What the Colota app sends, one file per message. `WireFixturesTest.kt` asserts that `PayloadBuilder` builds exactly these, and `apps/forwarder/test/wire.test.ts` posts them to the forwarder and checks what each target type receives. Change a file only together with both sides.
