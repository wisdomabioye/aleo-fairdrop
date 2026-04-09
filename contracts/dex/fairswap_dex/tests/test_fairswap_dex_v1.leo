// The 'test_fairswap_dex_v1' test program.
import fairswap_dex_v1.aleo;
program test_fairswap_dex_v1.aleo {
    @test
    @should_fail
    fn test_main_fails() {
        let result: u32 = fairswap_dex_v1.aleo::main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    constructor() {}
}
