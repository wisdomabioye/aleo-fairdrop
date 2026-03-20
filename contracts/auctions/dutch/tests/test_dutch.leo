// The 'test_dutch' test program.
import dutch.aleo;
program test_dutch.aleo {
    @test
    script test_it() {
        let result: u32 = dutch.aleo/main(1u32, 2u32);
        assert_eq(result, 3u32);
    }

    @test
    @should_fail
    transition do_nothing() {
        let result: u32 = dutch.aleo/main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    async constructor() {}
}
