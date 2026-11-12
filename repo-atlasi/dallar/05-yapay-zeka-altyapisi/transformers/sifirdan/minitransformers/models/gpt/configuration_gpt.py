"""GPT tarzı modelin yapılandırması (HF karşılığı: models/gpt2/configuration_gpt2.py)."""

from ...configuration_utils import PretrainedConfig


class GPTConfig(PretrainedConfig):
    model_type = "mini-gpt"

    def __init__(
        self,
        vocab_size=320,
        n_positions=64,
        n_embd=32,
        n_layer=2,
        n_head=4,
        layer_norm_epsilon=1e-5,
        initializer_range=0.02,
        seed=0,
        **kwargs,
    ):
        if n_embd % n_head:
            raise ValueError("n_embd, n_head'e tam bölünmeli")
        self.vocab_size = vocab_size
        self.n_positions = n_positions
        self.n_embd = n_embd
        self.n_layer = n_layer
        self.n_head = n_head
        self.layer_norm_epsilon = layer_norm_epsilon
        self.initializer_range = initializer_range
        self.seed = seed
        super().__init__(**kwargs)
